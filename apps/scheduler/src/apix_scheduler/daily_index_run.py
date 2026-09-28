"""``python -m apix_scheduler.daily_index_run`` — ``make daily-index-run DATE=...``.

Publishes the **daily** APIx series the problem statement asks for (``APIX.ALL.D``,
plus route, carrier-type and advance-window breakdowns), alongside the monthly
publication :mod:`apix_scheduler.index_run` produces.

How a day's value is built:

1. The window's ``fare_quote`` rows are cleaned exactly as the monthly run cleans them
   (:func:`apix_core.clean.clean_quotes`); outlier-flagged quotes are excluded.
2. Each (route, advance window, carrier) cell gets one GEKS-Törnqvist run over the
   whole window — transitive by construction, so day *t* against day *s* never depends
   on the path between them (ADR 0002).
3. Every day's cross-section of cell levels goes through the *same* aggregation
   hierarchy as the monthly publication (carrier → window → route with the
   booking-profile weights → national with the DGCA passenger-share weights).
4. Each resulting series is rebased so its first published day equals
   ``config/method.yaml``'s ``index_reference_value``.

Everything is written in one transaction with the same provenance the monthly run
records: ``data_snapshot``, ``method_config``, ``index_run``, the clean rows, the
``index_value`` rows, a first-publication ``revision_log`` entry for each, and the
``index_value_quote`` lineage linking each headline/route day to the clean quotes behind
it (CLAUDE.md principle 1).
"""

from __future__ import annotations

import argparse
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pandas as pd
import structlog
from sqlalchemy import create_engine, insert, select
from sqlalchemy.orm import Session

from apix_core.clean import clean_quotes
from apix_core.config import config_hash, find_config_dir, load_basket, load_cleaning, load_method
from apix_core.index import geks_tornqvist
from apix_core.index.daily import cell_daily_levels, rebase_series
from apix_core.models import (
    DataSnapshot,
    FareQuoteClean,
    IndexRun,
    IndexValue,
    IndexValueQuote,
    MethodConfig,
    RevisionLog,
    Route,
)
from apix_core.models.enums import Frequency, RunStatus
from apix_core.provenance.hashing import sha256_hex
from apix_core.settings import get_settings
from apix_scheduler.index_run import (
    _advance_window_for,
    _build_expected_cells,
    _carrier_type_by_iata,
    _cell_panel,
    _clean_rows_for_insert,
    _ensure_series,
    _load_collection_runs,
    _load_window_quotes,
    _rollup_hierarchy,
)

log = structlog.get_logger(__name__)

HEADLINE_DAILY = "APIX.ALL.D"


@dataclass(frozen=True)
class DailyRunResult:
    index_run_id: uuid.UUID
    snapshot_id: uuid.UUID
    first_day: date
    last_day: date
    days_published: int
    series_published: int
    skipped_cells: int


def build_daily_cells(
    quotes: pd.DataFrame,
    outlier_quote_ids: set[uuid.UUID],
    advance_window_of: dict[int, str | None],
    carrier_type_by_iata: dict[str, str],
    window_days: int,
) -> tuple[pd.DataFrame, list[tuple[str, str, str, str]]]:
    """Every cell's daily GEKS levels, stacked; plus the cells that could not be indexed
    (route, window, carrier, reason) — reported, never silently dropped.
    """
    work = quotes.loc[~quotes["id"].isin(outlier_quote_ids)].copy()
    work["advance_window"] = work["advance_days"].map(lambda d: advance_window_of.get(int(d)))
    frames: list[pd.DataFrame] = []
    skips: list[tuple[str, str, str, str]] = []
    groups = work.dropna(subset=["advance_window"]).groupby(
        ["route_code", "advance_window", "carrier_iata"], sort=True
    )
    for (route_code, advance_window, carrier_iata), cell_quotes in groups:
        panel = _cell_panel(cell_quotes)
        try:
            window_index = geks_tornqvist(panel, window_days=window_days)
        except ValueError as exc:
            skips.append((str(route_code), str(advance_window), str(carrier_iata), str(exc)))
            continue
        frames.append(
            cell_daily_levels(
                str(route_code),
                str(advance_window),
                carrier_type_by_iata.get(str(carrier_iata), "UNKNOWN"),
                window_index,
                panel,
            )
        )
    if not frames:
        return pd.DataFrame(), skips
    return pd.concat(frames, ignore_index=True), skips


def compute_and_persist_daily(session: Session, as_of: date, days: int) -> DailyRunResult:
    """Compute and publish the daily series for ``[as_of - days + 1, as_of]``."""
    config_dir = find_config_dir()
    seeds_dir = config_dir.parent / "db" / "seeds"
    basket = load_basket(config_dir)
    method = load_method(config_dir)
    cleaning = load_cleaning(config_dir)
    carrier_type_by_iata = _carrier_type_by_iata(seeds_dir)

    start = as_of - timedelta(days=days - 1)
    quotes = _load_window_quotes(session, start, as_of)
    if quotes.empty:
        raise RuntimeError(
            f"no fare_quote rows with query_date in [{start}, {as_of}] — "
            "seed or collect data for this window first"
        )
    collection_runs = _load_collection_runs(session, start, as_of)
    snapshot_id = uuid.uuid4()
    clean_result = clean_quotes(
        quotes=quotes,
        expected_cells=_build_expected_cells(quotes, collection_runs),
        collection_runs=collection_runs,
        carrier_type_by_iata=carrier_type_by_iata,
        airport_udf={},
        snapshot_id=str(snapshot_id),
        config=cleaning,
    )
    persistable = clean_result.clean.dropna(subset=["dep_hour_bucket", "stops"]).reset_index(
        drop=True
    )
    clean_ids = [uuid.uuid4() for _ in range(len(persistable))]
    persistable["clean_id"] = clean_ids
    persistable["query_date"] = [
        travel_date - timedelta(days=int(advance_days))
        for travel_date, advance_days in zip(
            persistable["travel_date"], persistable["advance_days"], strict=True
        )
    ]
    clean_rows = _clean_rows_for_insert(
        persistable.drop(columns=["clean_id", "query_date"]), clean_ids
    )
    outlier_ids = set(clean_result.clean.loc[clean_result.clean["is_outlier"], "quote_id"].dropna())

    advance_window_of = {
        int(d): _advance_window_for(basket, int(d)) for d in quotes["advance_days"].unique()
    }
    cells, skips = build_daily_cells(
        quotes, outlier_ids, advance_window_of, carrier_type_by_iata, window_days=days
    )
    if cells.empty:
        raise RuntimeError(f"no cell could be indexed in [{start}, {as_of}]")
    if skips:
        log.info("daily_index_skipped_cells", count=len(skips), sample=skips[:5])

    # series_code -> {day: (value, n_quotes, coverage_pct)}
    raw: dict[str, dict[date, tuple[float, int, float]]] = {}
    for day, day_cells in cells.groupby("period", sort=True):
        hierarchy = _rollup_hierarchy(day_cells, "index_value", basket, method, freq="D")
        for series_code, triple in hierarchy.items():
            raw.setdefault(series_code, {})[day] = triple

    rebased: dict[str, dict[date, float]] = {
        code: rebase_series({d: v[0] for d, v in by_day.items()}, method.index_reference_value)
        for code, by_day in raw.items()
    }

    # ---- persist -------------------------------------------------------------------
    method_hash = config_hash(method)
    method_row = session.execute(
        select(MethodConfig).where(MethodConfig.config_hash == method_hash)
    ).scalar_one_or_none()
    if method_row is None:
        method_row = MethodConfig(
            id=uuid.uuid4(), config_hash=method_hash, config=method.model_dump(mode="json")
        )
        session.add(method_row)
        session.flush()

    content_hash = sha256_hex(
        "|".join(
            sorted(f"{r['quote_id']}:{r['total_fare']}" for r in clean_rows if r["quote_id"])
        ).encode("utf-8")
    )
    session.add(
        DataSnapshot(
            id=snapshot_id,
            row_count=len(clean_rows),
            content_hash=content_hash,
            description=f"daily_index_run as_of={as_of.isoformat()} days={days}",
        )
    )
    session.flush()
    if clean_rows:
        session.execute(insert(FareQuoteClean), clean_rows)

    computed_at = datetime.now(tz=UTC)
    run_row = IndexRun(
        id=uuid.uuid4(),
        snapshot_id=snapshot_id,
        method_config_id=method_row.id,
        vintage_date=as_of,
        computed_at=computed_at,
        status=RunStatus.SUCCEEDED,
        released_at=computed_at,
    )
    session.add(run_row)
    session.flush()

    series_ids = _ensure_series(session, set(rebased), frequency=Frequency.DAILY)
    value_rows: list[dict[str, Any]] = []
    revision_rows: list[dict[str, Any]] = []
    for code, by_day in rebased.items():
        for day, value in by_day.items():
            _, n_quotes, coverage_pct = raw[code][day]
            value_rows.append(
                {
                    "index_run_id": run_row.id,
                    "series_id": series_ids[code],
                    "period": day,
                    "value": round(value, 6),
                    "n_quotes": n_quotes,
                    "coverage_pct": round(min(max(coverage_pct, 0.0), 100.0), 2),
                }
            )
            revision_rows.append(
                {
                    "id": uuid.uuid4(),
                    "series_id": series_ids[code],
                    "period": day,
                    "old_value": None,
                    "new_value": round(value, 6),
                    "reason": "First publication of the day (daily series).",
                    "revised_at": computed_at,
                }
            )
    session.execute(insert(IndexValue), value_rows)
    session.execute(insert(RevisionLog), revision_rows)

    # Lineage: each headline day and each route day -> the clean quotes behind it.
    route_code_by_id: dict[uuid.UUID, str] = dict(
        session.execute(select(Route.id, Route.code)).tuples().all()
    )
    usable = persistable.loc[~persistable["is_outlier"]]
    lineage: list[dict[str, Any]] = []
    for (day, route_id), group in usable.groupby(["query_date", "route_id"]):
        route_code = f"APIX.ROUTE.{route_code_by_id.get(route_id)}.D"
        for code in (HEADLINE_DAILY, route_code):
            if code in rebased and day in rebased[code]:
                lineage.extend(
                    {
                        "index_run_id": run_row.id,
                        "series_id": series_ids[code],
                        "period": day,
                        "clean_id": clean_id,
                    }
                    for clean_id in group["clean_id"]
                )
    for offset in range(0, len(lineage), 50_000):
        session.execute(insert(IndexValueQuote), lineage[offset : offset + 50_000])

    session.commit()
    all_days = sorted({d for by_day in rebased.values() for d in by_day})
    return DailyRunResult(
        index_run_id=run_row.id,
        snapshot_id=snapshot_id,
        first_day=all_days[0],
        last_day=all_days[-1],
        days_published=len(rebased.get(HEADLINE_DAILY, {})),
        series_published=len(rebased),
        skipped_cells=len(skips),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--date", type=date.fromisoformat, required=True, help="last day")
    parser.add_argument("--days", type=int, default=60, help="window length in days")
    args = parser.parse_args(argv)
    engine = create_engine(get_settings().database_sync_url)
    with Session(engine) as session:
        result = compute_and_persist_daily(session, args.date, args.days)
    log.info(
        "daily_index_run_finished",
        index_run_id=str(result.index_run_id),
        first_day=result.first_day.isoformat(),
        last_day=result.last_day.isoformat(),
        days_published=result.days_published,
        series_published=result.series_published,
        skipped_cells=result.skipped_cells,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

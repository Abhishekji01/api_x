"""``python -m apix_scheduler.esankhyiki_fetch`` — pull the CPI air-fare item index from
MoSPI's eSankhyiki API into the CSV extract :mod:`apix_scheduler.cpi_loader` loads.

The problem statement names eSankhyiki (https://esankhyiki.mospi.gov.in) as its dataset
portal. Its API (``api.mospi.gov.in``) serves the official CPI at item level; the
air-fare item is the benchmark APIx is validated against on ``/v1/validation``.

Compliance: the request goes through :meth:`PolicyEngine.request` like every other
outbound request (CLAUDE.md guardrail). The ``cpi_mospi`` source in
``config/sources.yaml`` ships disabled and ``NOT_REVIEWED``, so this command refuses to
run until a team member has read MoSPI's terms and recorded the review there
(``enabled: true``, ``tos_verdict: PERMITTED``, ``tos_reviewed_at``,
``legal_basis: OFFICIAL_PUBLICATION``). The manual path needs no review at all:
download the series from the eSankhyiki website and write the same CSV by hand
(see ``docs/data-sources.md``).

Output — the exact shape ``make load-cpi`` expects::

    # MoSPI CPI (eSankhyiki API), item <item_code> "<item name>", base <base_year>.
    # Fetched <UTC timestamp> from <URL> via PolicyEngine.
    period,value,base_year,release_date
    2026-07,103.8,2024,2026-08-12
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import redis
import structlog
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from apix_core.policy import DatabaseDecisionLog, load_policy_engine
from apix_core.settings import get_settings

log = structlog.get_logger(__name__)

API_BASE = "https://api.mospi.gov.in"
#: CPI (base 2024) unified endpoint; item level.
CPI_ENDPOINT = "/api/cpi/getCPIData"
#: COICOP 2018 code of the air-fare item in the CPI 2024 series. Confirm against the
#: portal's item list (``/api/cpi/getCpiFilterByLevelAndBaseYear?base_year=2024&level=Item``)
#: before relying on it — MoSPI owns the code list, not APIx.
DEFAULT_ITEM_CODE = "07.3.3.1.2.01"

_MONTHS = {
    m.lower(): i
    for i, m in enumerate(
        [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ],
        start=1,
    )
}


class FetchError(RuntimeError):
    """The response cannot be turned into a complete, correct extract."""


@dataclass(frozen=True)
class CpiObservation:
    period: date
    value: float
    base_year: str


def _month_number(raw: Any) -> int:
    text = str(raw).strip()
    if text.isdigit():
        month = int(text)
    else:
        month = _MONTHS.get(text.lower(), 0) or _MONTHS.get(text[:3].lower(), 0)
        if month == 0:
            month = next((n for name, n in _MONTHS.items() if name.startswith(text.lower())), 0)
    if not 1 <= month <= 12:
        raise FetchError(f"unrecognised month {raw!r}")
    return month


def parse_records(payload: dict[str, Any], *, base_year: str, sector: str) -> list[CpiObservation]:
    """Turn an eSankhyiki CPI JSON payload into observations for one sector.

    The API wraps records in ``data`` (a list of dicts). Field names vary slightly
    between releases, so the common spellings are accepted; anything else is refused
    rather than guessed at.
    """
    records = payload.get("data")
    if not isinstance(records, list) or not records:
        raise FetchError(f"no records in response (keys: {sorted(payload)})")
    out: dict[date, CpiObservation] = {}
    for record in records:
        if not isinstance(record, dict):
            raise FetchError(f"unexpected record {record!r}")
        lowered = {str(k).lower(): v for k, v in record.items()}
        rec_sector = str(lowered.get("sector", sector)).strip().lower()
        if rec_sector and rec_sector != sector.lower():
            continue
        year = lowered.get("year")
        month = lowered.get("month") or lowered.get("month_code")
        value = lowered.get("index") or lowered.get("index_value") or lowered.get("value")
        if year is None or month is None or value in (None, "", "NA"):
            continue
        period = date(int(str(year)[:4]), _month_number(month), 1)
        out[period] = CpiObservation(period=period, value=float(value), base_year=base_year)
    if not out:
        raise FetchError(f"no {sector!r} records with a year, month and index value")
    return [out[p] for p in sorted(out)]


def write_extract(
    observations: list[CpiObservation],
    path: Path,
    *,
    url: str,
    item_code: str,
    fetched_at: datetime,
) -> None:
    """Write the ``cpi_loader`` CSV. ``release_date`` is the fetch date: the API does not
    report one, and a later fetch that finds a revised value is then a later vintage.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        fh.write(f"# MoSPI CPI via eSankhyiki API, item {item_code} (air fare).\n")
        fh.write(f"# Fetched {fetched_at.isoformat()} from {url} through the PolicyEngine.\n")
        writer = csv.writer(fh)
        writer.writerow(["period", "value", "base_year", "release_date"])
        for obs in observations:
            writer.writerow(
                [
                    obs.period.strftime("%Y-%m"),
                    f"{obs.value:.4f}",
                    obs.base_year,
                    fetched_at.date().isoformat(),
                ]
            )


def build_url(*, item_code: str, base_year: str, years: list[int]) -> str:
    query = {
        "base_year": base_year,
        "level": "Item",
        "item_code": item_code,
        "year": ",".join(str(y) for y in years),
        "Format": "JSON",
    }
    return f"{API_BASE}{CPI_ENDPOINT}?{urlencode(query)}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--out", type=Path, default=Path("db/seeds/cpi/cpi_airfare.csv"))
    parser.add_argument("--item-code", default=DEFAULT_ITEM_CODE)
    parser.add_argument("--base-year", default="2024")
    parser.add_argument("--sector", default="Combined", help="Rural, Urban or Combined")
    parser.add_argument(
        "--years", default=str(datetime.now(UTC).year), help="comma-separated, e.g. 2025,2026"
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    url = build_url(
        item_code=args.item_code,
        base_year=args.base_year,
        years=[int(y) for y in args.years.split(",")],
    )
    engine = create_engine(settings.database_sync_url)
    redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    with load_policy_engine(
        redis_client=redis_client,
        decision_log=DatabaseDecisionLog(lambda: Session(engine)),
        user_agent=settings.user_agent,
    ) as policy_engine:
        response = policy_engine.request(url)
    response.raise_for_status()
    observations = parse_records(response.json(), base_year=args.base_year, sector=args.sector)
    fetched_at = datetime.now(UTC)
    write_extract(observations, args.out, url=url, item_code=args.item_code, fetched_at=fetched_at)
    log.info(
        "esankhyiki_cpi_extract_written",
        path=str(args.out),
        periods=len(observations),
        first=observations[0].period.isoformat(),
        last=observations[-1].period.isoformat(),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

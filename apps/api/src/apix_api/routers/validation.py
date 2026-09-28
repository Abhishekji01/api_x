"""``/v1/validation`` and ``/v1/pipeline`` — the back-test and the collection pipeline.

``/v1/validation`` answers the problem statement's requirement to "demonstrate at least
30 days of back-tested results against publicly available DGCA monthly average-fare
data": the daily APIx series, its monthly average, and every benchmark it can be
compared with, each scored with :func:`apix_core.backtest.score_apix_vs_dgca`.

A benchmark that has not been loaded is reported as ``NOT_LOADED`` with the command
that loads it — never filled with an estimate (CLAUDE.md principle 5).

``/v1/pipeline`` is the operational view: how many quotes were collected, cleaned,
flagged and imputed; every source with its compliance position; and the
PolicyEngine's decisions.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Annotated, Literal

import pandas as pd
from fastapi import APIRouter, Query
from sqlalchemy import distinct, func, select

from apix_api.auth import RoleDep  # noqa: TC001
from apix_api.db import SessionDep  # noqa: TC001
from apix_api.errors import ERROR_RESPONSES
from apix_api.meta import build_meta
from apix_api.queries import get_series_id, latest_values
from apix_api.schemas import (
    Benchmark,
    PipelineResponse,
    PipelineSource,
    PipelineStage,
    SeriesPoint,
    ValidationResponse,
    ValidationScore,
)
from apix_core.backtest import score_apix_vs_dgca
from apix_core.config import load_backtest, load_basket, load_method
from apix_core.models import (
    CollectionRun,
    CpiAirfareIndex,
    DataSnapshot,
    DgcaFareReference,
    FareQuote,
    FareQuoteClean,
    IndexValue,
    PolicyDecision,
    Source,
    SourcePolicy,
)
from apix_core.models.enums import SourceType

router = APIRouter(prefix="/v1", tags=["validation"], responses=ERROR_RESPONSES)

DataOrigin = Literal["COLLECTED", "SYNTHETIC", "MIXED", "NONE"]

# Mirrors apix_scheduler.flows.daily_sweep._DEFAULT_SWEEP_TIMES. The API does not import
# the scheduler package (it is not a dependency of apix_api), so the value is restated
# here and a test asserts the two stay equal.
SWEEP_TIMES_LOCAL: tuple[str, ...] = ("02:00", "08:00", "14:00", "20:00")

SAFEGUARDS: tuple[str, ...] = (
    "Every request passes through the PolicyEngine before it leaves the machine.",
    "robots.txt is fetched and obeyed; APIX_RESPECT_ROBOTS=false is refused at start-up.",
    "Per-source crawl delay and hourly request budget, enforced with Redis token buckets.",
    "A source is collected only after a human records a PERMITTED terms-of-service review.",
    "No logins, no credentials, no CAPTCHA solving — a CAPTCHA marks the source blocked.",
    "An honest, contactable User-Agent identifies APIx on every request.",
    "Raw quotes are append-only; every correction is logged against the original.",
)


def _rebased(values: pd.Series) -> pd.Series:
    """``values`` rebased to 100 at its first period (ratios unchanged)."""
    values = values.sort_index()
    return values / float(values.iloc[0]) * 100.0


def _points(values: pd.Series) -> list[SeriesPoint]:
    if values.empty:
        return []
    indexed = _rebased(values)
    return [
        SeriesPoint(period=period, value=round(float(v), 4), index_value=round(float(i), 4))
        for (period, v), i in zip(values.sort_index().items(), indexed, strict=True)
    ]


def _score(apix: pd.Series, reference: pd.Series, min_periods: int) -> ValidationScore:
    """Score two series on a common base: both rebased to 100 at their first shared
    period, so a rupee-denominated benchmark and an index can be compared.
    """
    common = sorted(set(apix.index) & set(reference.index))
    if not common:
        return ValidationScore(
            n_periods=0,
            period_from=None,
            period_to=None,
            correlation=None,
            mape=None,
            directional_accuracy=None,
            note="No period is present in both series yet.",
        )
    apix_c = _rebased(apix.loc[common])
    ref_c = _rebased(reference.loc[common])
    result = score_apix_vs_dgca(apix_c, ref_c, min_periods=min_periods)
    return ValidationScore(
        n_periods=result.n_periods,
        period_from=result.period_from,  # type: ignore[arg-type]
        period_to=result.period_to,  # type: ignore[arg-type]
        correlation=None if result.correlation is None else round(result.correlation, 4),
        mape=None if result.mape is None else round(result.mape, 3),
        directional_accuracy=(
            None if result.directional_accuracy is None else round(result.directional_accuracy, 1)
        ),
        note=result.coverage_note,
    )


async def _data_origin(session: SessionDep) -> DataOrigin:
    types = set(
        (
            await session.execute(
                select(distinct(Source.source_type)).join(
                    FareQuote, FareQuote.source_id == Source.id
                )
            )
        )
        .scalars()
        .all()
    )
    if not types:
        return "NONE"
    if types == {SourceType.SYNTHETIC}:
        return "SYNTHETIC"
    if SourceType.SYNTHETIC in types:
        return "MIXED"
    return "COLLECTED"


@router.get(
    "/validation",
    summary="Back-test: APIx against CPI air fare, DGCA average fares and a unit-value mean",
    response_model=ValidationResponse,
)
async def get_validation(
    session: SessionDep,
    role: RoleDep,
    series: Annotated[
        str, Query(description="Daily APIx series to validate.", max_length=64)
    ] = "APIX.ALL.D",
) -> ValidationResponse:
    """Every benchmark the index can be checked against, with its score.

    * **CPI air fare** (MoSPI, eSankhyiki) — monthly; scored against the monthly mean of
      the daily APIx series.
    * **DGCA average fare** — monthly, INR; the mean across loaded basket routes, rebased.
    * **Unit-value mean** — the plain daily average of the same quotes APIx is built
      from. Not a benchmark of truth: it shows how far a naive average (which moves with
      the booking-window and route mix) departs from a matched-sample index.
    """
    basket = load_basket()
    method = load_method()
    backtest = load_backtest()
    min_periods = backtest.min_periods_for_correlation
    origin = await _data_origin(session)

    series_id = await get_series_id(session, series)
    rows = [] if series_id is None else await latest_values(session, series_id, role=role)
    apix_daily = pd.Series(
        {row["period"]: float(row["value"]) for row in rows}, dtype="float64"
    ).sort_index()
    apix_monthly = (
        apix_daily.groupby([date(p.year, p.month, 1) for p in apix_daily.index]).mean()
        if not apix_daily.empty
        else pd.Series(dtype="float64")
    )

    benchmarks: list[Benchmark] = []

    # ---- CPI air fare (latest release of each period) -------------------------------
    cpi_rows = (
        await session.execute(
            select(
                CpiAirfareIndex.period, CpiAirfareIndex.value, CpiAirfareIndex.release_date
            ).order_by(CpiAirfareIndex.period, CpiAirfareIndex.release_date)
        )
    ).all()
    cpi = pd.Series({period: float(value) for period, value, _ in cpi_rows}, dtype="float64")
    benchmarks.append(
        Benchmark(
            code="CPI_AIRFARE",
            label="CPI — air fare item index",
            source="MoSPI / NSO, eSankhyiki (Consumer Price Index)",
            frequency="M",
            unit="index points",
            status="LOADED" if not cpi.empty else "NOT_LOADED",
            points=_points(cpi),
            score=_score(apix_monthly, cpi, min_periods) if not cpi.empty else None,
            note=(
                "Official monthly CPI air-fare index; APIx is compared on its monthly mean."
                if not cpi.empty
                else "Not loaded yet. The official series is published monthly on eSankhyiki."
            ),
            how_to_load=None
            if not cpi.empty
            else (
                "uv run python -m apix_scheduler.esankhyiki_fetch --out db/seeds/cpi/cpi.csv"
                ' && make load-cpi FILE=db/seeds/cpi/cpi.csv NOTE="MoSPI eSankhyiki"'
            ),
        )
    )

    # ---- DGCA average fare (mean across loaded routes) -------------------------------
    dgca_rows = (
        await session.execute(
            select(DgcaFareReference.period, func.avg(DgcaFareReference.avg_fare)).group_by(
                DgcaFareReference.period
            )
        )
    ).all()
    dgca = pd.Series({period: float(v) for period, v in dgca_rows}, dtype="float64")
    benchmarks.append(
        Benchmark(
            code="DGCA_AVG_FARE",
            label="DGCA — monthly average fare",
            source="Directorate General of Civil Aviation, published average fares",
            frequency="M",
            unit="INR",
            status="LOADED" if not dgca.empty else "NOT_LOADED",
            points=_points(dgca),
            score=_score(apix_monthly, dgca, min_periods) if not dgca.empty else None,
            note=(
                "Mean of the loaded basket routes' published average fares, rebased to 100."
                if not dgca.empty
                else "Not loaded yet. DGCA publishes average fares monthly, about a month late."
            ),
            how_to_load=None
            if not dgca.empty
            else 'make load-dgca-fares FILE=db/seeds/dgca_fares/<month>.csv NOTE="<citation>"',
        )
    )

    # ---- unit-value mean of the same quotes ------------------------------------------
    uv_rows = (
        await session.execute(
            select(FareQuote.query_date, func.avg(FareQuote.total_fare))
            .group_by(FareQuote.query_date)
            .order_by(FareQuote.query_date)
        )
    ).all()
    unit_value = pd.Series({d: float(v) for d, v in uv_rows}, dtype="float64")
    if not apix_daily.empty:
        unit_value = unit_value.loc[
            (unit_value.index >= apix_daily.index.min())
            & (unit_value.index <= apix_daily.index.max())
        ]
    benchmarks.append(
        Benchmark(
            code="UNIT_VALUE",
            label="Unit-value mean fare (same quotes)",
            source="Computed from APIx's own quotes — a simple daily average",
            frequency="D",
            unit="INR",
            status="COMPUTED",
            points=_points(unit_value),
            score=_score(apix_daily, unit_value, min_periods) if not unit_value.empty else None,
            note=(
                "A plain average moves with the mix of routes and booking windows sampled "
                "each day; APIx compares like with like. The gap between the two lines is "
                "the mix effect a matched-sample index removes."
            ),
        )
    )

    return ValidationResponse(
        series=series,
        data_origin=origin,
        apix_daily=_points(apix_daily),
        apix_monthly=_points(apix_monthly),
        benchmarks=benchmarks,
        min_periods_for_score=min_periods,
        meta=build_meta(
            method_version=method.method_version,
            basket_version=basket.basket_version,
        ),
    )


@router.get(
    "/pipeline",
    summary="Collection, cleaning and compliance, end to end",
    response_model=PipelineResponse,
)
async def get_pipeline(session: SessionDep) -> PipelineResponse:
    """What the collector gathered, what cleaning did to it, and under what rules."""
    basket = load_basket()
    origin = await _data_origin(session)

    first_day, last_day, n_days, n_raw = (
        await session.execute(
            select(
                func.min(FareQuote.query_date),
                func.max(FareQuote.query_date),
                func.count(distinct(FareQuote.query_date)),
                func.count(),
            )
        )
    ).one()

    # Cleaning counts come from the most recent snapshot that produced clean rows.
    latest_snapshot = (
        await session.execute(
            select(DataSnapshot.id)
            .where(DataSnapshot.row_count > 0)
            .order_by(DataSnapshot.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    n_window = n_clean = n_outliers = n_imputed = 0
    if latest_snapshot is not None:
        n_window, n_clean, n_outliers, n_imputed = (
            await session.execute(
                select(
                    func.count(distinct(FareQuoteClean.quote_id)),
                    func.count(),
                    func.count().filter(FareQuoteClean.is_outlier),
                    func.count().filter(FareQuoteClean.is_imputed),
                ).where(FareQuoteClean.snapshot_id == latest_snapshot)
            )
        ).one()
    n_indexed = (await session.execute(select(func.count()).select_from(IndexValue))).scalar_one()

    stages = [
        PipelineStage(
            key="collected",
            label="Raw quotes collected (all time)",
            count=int(n_raw),
            note="Append-only; never edited after collection.",
        ),
        PipelineStage(
            key="window",
            label="Quotes in the current index window",
            count=int(n_window),
            note="The raw quotes the latest index run read.",
        ),
        PipelineStage(
            key="clean",
            label="Rows after cleaning",
            count=int(n_clean),
            note="De-duplicated and fare-decomposed (base, taxes, UDF, convenience fee).",
        ),
        PipelineStage(
            key="outliers",
            label="Flagged as outliers",
            count=int(n_outliers),
            note="Kept and flagged with the rule that caught them — excluded from the index.",
        ),
        PipelineStage(
            key="imputed",
            label="Imputed (sold-out / missing)",
            count=int(n_imputed),
            note="Every imputed row records its method; nothing is carried forward silently.",
        ),
        PipelineStage(
            key="indexed",
            label="Index values published",
            count=int(n_indexed),
            note="Daily and monthly, headline and every breakdown, each with its lineage.",
        ),
    ]

    last_run = (
        select(
            CollectionRun.source_id,
            func.max(CollectionRun.started_at).label("last_at"),
            func.sum(CollectionRun.quotes_collected).label("quotes"),
            func.sum(CollectionRun.blocked_count).label("blocked"),
        )
        .group_by(CollectionRun.source_id)
        .subquery()
    )
    source_rows = (
        await session.execute(
            select(Source, SourcePolicy, last_run.c.last_at, last_run.c.quotes, last_run.c.blocked)
            .outerjoin(SourcePolicy, SourcePolicy.source_id == Source.id)
            .outerjoin(last_run, last_run.c.source_id == Source.id)
            .order_by(Source.enabled.desc(), Source.source_type, Source.code)
        )
    ).all()
    status_by_source: dict[object, str] = {}
    for source_id, status in (
        await session.execute(
            select(CollectionRun.source_id, CollectionRun.status)
            .distinct(CollectionRun.source_id)
            .order_by(CollectionRun.source_id, CollectionRun.started_at.desc())
        )
    ).all():
        status_by_source[source_id] = status.value if hasattr(status, "value") else str(status)

    sources = [
        PipelineSource(
            code=src.code,
            display_name=src.display_name,
            domain=src.domain,
            source_type=src.source_type.value,
            enabled=src.enabled,
            tos_verdict=None if pol is None else pol.tos_verdict.value,
            tos_reviewed_at=None
            if pol is None or pol.tos_reviewed_at is None
            else pol.tos_reviewed_at.date(),
            legal_basis=None if pol is None else pol.legal_basis,
            robots_url=None if pol is None else pol.robots_url,
            crawl_delay_s=None if pol is None else float(pol.crawl_delay_s),
            max_requests_per_hour=None if pol is None else pol.max_requests_per_hour,
            last_run_at=None if last_at is None else last_at.isoformat(),
            last_run_status=status_by_source.get(src.id),
            quotes_total=int(quotes or 0),
            blocked_total=int(blocked or 0),
        )
        for src, pol, last_at, quotes, blocked in source_rows
    ]

    decisions: dict[str, int] = defaultdict(int)
    for outcome, count in (
        await session.execute(
            select(PolicyDecision.decision, func.count()).group_by(PolicyDecision.decision)
        )
    ).all():
        decisions[outcome.value if hasattr(outcome, "value") else str(outcome)] = int(count)

    return PipelineResponse(
        data_origin=origin,
        first_query_date=first_day,
        last_query_date=last_day,
        days_collected=int(n_days or 0),
        routes_in_basket=len(basket.routes),
        advance_windows=[w.code for w in basket.advance_windows],
        sweep_times_local=list(SWEEP_TIMES_LOCAL),
        stages=stages,
        sources=sources,
        policy_decisions=dict(decisions),
        safeguards=list(SAFEGUARDS),
        meta=build_meta(
            basket_version=basket.basket_version,
        ),
    )

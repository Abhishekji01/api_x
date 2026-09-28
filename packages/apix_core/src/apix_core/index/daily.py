"""Daily index series: per-cell daily levels and the rebasing that publishes them.

The monthly publication (:mod:`apix_scheduler.index_run`) compares two ends of a GEKS
window. The daily series reads the *whole* window instead: a GEKS-Törnqvist run over a
cell's panel already yields one transitive level per collection day, so the daily
headline is simply the same aggregation hierarchy applied to every day's cross-section
of cell levels.

Pure functions only — no database, no I/O (CLAUDE.md: index maths are pure).
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date

import pandas as pd

__all__ = ["DAILY_CELL_COLUMNS", "cell_daily_levels", "rebase_series"]

DAILY_CELL_COLUMNS = (
    "route_code",
    "advance_window",
    "carrier_type",
    "period",
    "index_value",
    "n_quotes",
    "coverage_pct",
)


def cell_daily_levels(
    route_code: str,
    advance_window: str,
    carrier_type: str,
    window_index: pd.Series,
    panel: pd.DataFrame,
) -> pd.DataFrame:
    """One row per day of a single cell's GEKS window.

    ``window_index`` is the cell's GEKS level by period (1.0 on its first period);
    ``panel`` is the (period, product_id, price, share) panel it was computed from.

    ``n_quotes`` is the number of products observed that day, and ``coverage_pct`` the
    share of the window's first-day products still observed that day — the same
    matched-sample definition the monthly publication reports, so the two stay
    comparable. A day with no observation in the cell simply has no row: it is absent
    from that day's cross-section, which the day's coverage then reports.
    """
    if window_index.empty:
        return pd.DataFrame(columns=list(DAILY_CELL_COLUMNS))
    first_period = panel["period"].min()
    first_products = set(panel.loc[panel["period"] == first_period, "product_id"])
    products_by_day = panel.groupby("period")["product_id"].apply(set)
    rows = []
    for period, level in window_index.items():
        observed = products_by_day.get(period, set())
        if not observed:
            continue
        matched = len(first_products & observed)
        rows.append(
            {
                "route_code": route_code,
                "advance_window": advance_window,
                "carrier_type": carrier_type,
                "period": period,
                "index_value": float(level),
                "n_quotes": len(observed),
                "coverage_pct": 100.0 * matched / len(first_products) if first_products else 0.0,
            }
        )
    return pd.DataFrame(rows, columns=list(DAILY_CELL_COLUMNS))


def rebase_series(values: Mapping[date, float], reference_value: float) -> dict[date, float]:
    """Rescale a daily series so its first day equals ``reference_value``.

    Ratios between days are preserved exactly; only the scale changes. An empty series
    stays empty, and a non-positive first value is refused rather than divided through.
    """
    if not values:
        return {}
    ordered = sorted(values)
    first = values[ordered[0]]
    if first <= 0:
        raise ValueError(f"cannot rebase a series whose first value is {first!r}")
    factor = reference_value / first
    return {day: values[day] * factor for day in ordered}

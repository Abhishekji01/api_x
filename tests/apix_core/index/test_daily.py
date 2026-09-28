"""Daily series helpers — hand-computed cases."""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from apix_core.index.daily import DAILY_CELL_COLUMNS, cell_daily_levels, rebase_series

D1, D2, D3 = date(2026, 9, 1), date(2026, 9, 2), date(2026, 9, 3)


def _panel(rows: list[tuple[date, str, float]]) -> pd.DataFrame:
    return pd.DataFrame(
        [{"period": d, "product_id": p, "price": price, "share": 1.0} for d, p, price in rows]
    )


class TestCellDailyLevels:
    def test_one_row_per_observed_day_with_matched_coverage(self) -> None:
        panel = _panel(
            [
                (D1, "a", 100.0),
                (D1, "b", 200.0),
                (D2, "a", 110.0),
                (D2, "b", 220.0),
                (D3, "a", 120.0),  # b missing on D3 -> half the first-day sample
            ]
        )
        window_index = pd.Series([1.0, 1.1, 1.2], index=[D1, D2, D3])
        out = cell_daily_levels("DEL-BOM", "AP04_07", "LCC", window_index, panel)

        assert list(out.columns) == list(DAILY_CELL_COLUMNS)
        assert list(out["period"]) == [D1, D2, D3]
        assert list(out["index_value"]) == [1.0, 1.1, 1.2]
        assert list(out["n_quotes"]) == [2, 2, 1]
        assert list(out["coverage_pct"]) == [100.0, 100.0, 50.0]

    def test_a_day_with_no_observation_is_absent_not_imputed(self) -> None:
        panel = _panel([(D1, "a", 100.0), (D3, "a", 90.0)])
        window_index = pd.Series([1.0, 0.95, 0.9], index=[D1, D2, D3])
        out = cell_daily_levels("DEL-BOM", "AP04_07", "LCC", window_index, panel)
        assert list(out["period"]) == [D1, D3]

    def test_empty_window_gives_empty_frame(self) -> None:
        out = cell_daily_levels("DEL-BOM", "AP04_07", "LCC", pd.Series(dtype="float64"), _panel([]))
        assert out.empty
        assert list(out.columns) == list(DAILY_CELL_COLUMNS)


class TestRebaseSeries:
    def test_first_day_becomes_the_reference_and_ratios_hold(self) -> None:
        out = rebase_series({D2: 1.1, D1: 0.5, D3: 0.55}, 100.0)
        assert list(out) == [D1, D2, D3]
        assert out[D1] == pytest.approx(100.0)
        assert out[D2] == pytest.approx(220.0)
        assert out[D3] / out[D2] == pytest.approx(0.55 / 1.1)

    def test_empty_stays_empty(self) -> None:
        assert rebase_series({}, 100.0) == {}

    def test_non_positive_base_is_refused(self) -> None:
        with pytest.raises(ValueError, match="cannot rebase"):
            rebase_series({D1: 0.0, D2: 1.0}, 100.0)

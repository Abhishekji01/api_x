"""eSankhyiki CPI extract: parsing and the CSV contract with cpi_loader. No network."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import TYPE_CHECKING
from urllib.parse import parse_qs, urlsplit

import pytest

from apix_scheduler.cpi_loader import read_extract
from apix_scheduler.esankhyiki_fetch import (
    DEFAULT_ITEM_CODE,
    FetchError,
    build_url,
    parse_records,
    write_extract,
)

if TYPE_CHECKING:
    from pathlib import Path

PAYLOAD = {
    "data": [
        {"year": 2026, "month": "July", "sector": "Combined", "index": "104.2"},
        {"year": 2026, "month": "July", "sector": "Rural", "index": "101.0"},
        {"year": 2026, "month": "June", "sector": "Combined", "index": "103.1"},
        {"year": 2026, "month": "August", "sector": "Combined", "index": "NA"},
    ]
}


def test_parse_keeps_one_sector_in_period_order_and_skips_missing_values() -> None:
    obs = parse_records(PAYLOAD, base_year="2024", sector="Combined")
    assert [(o.period, o.value) for o in obs] == [
        (date(2026, 6, 1), 103.1),
        (date(2026, 7, 1), 104.2),
    ]


def test_numeric_month_codes_are_accepted() -> None:
    payload = {"data": [{"Year": "2026", "month_code": "3", "Index_Value": 99.5}]}
    obs = parse_records(payload, base_year="2024", sector="Combined")
    assert obs[0].period == date(2026, 3, 1)


@pytest.mark.parametrize("payload", [{}, {"data": []}, {"data": [{"year": 2026}]}])
def test_an_unusable_payload_is_refused_not_guessed(payload: dict[str, object]) -> None:
    with pytest.raises(FetchError):
        parse_records(payload, base_year="2024", sector="Combined")


def test_extract_round_trips_through_the_loader(tmp_path: Path) -> None:
    obs = parse_records(PAYLOAD, base_year="2024", sector="Combined")
    path = tmp_path / "cpi.csv"
    fetched = datetime(2026, 9, 28, 10, 0, tzinfo=UTC)
    write_extract(obs, path, url="https://api.mospi.gov.in/x", item_code="X", fetched_at=fetched)
    rows = read_extract(path)
    assert [(r.period, float(r.value), r.base_year, r.release_date) for r in rows] == [
        (date(2026, 6, 1), 103.1, "2024", date(2026, 9, 28)),
        (date(2026, 7, 1), 104.2, "2024", date(2026, 9, 28)),
    ]


def test_url_targets_the_official_api_with_the_air_fare_item() -> None:
    url = build_url(item_code=DEFAULT_ITEM_CODE, base_year="2024", years=[2025, 2026])
    parts = urlsplit(url)
    assert parts.hostname == "api.mospi.gov.in"
    query = parse_qs(parts.query)
    assert query["item_code"] == [DEFAULT_ITEM_CODE]
    assert query["year"] == ["2025,2026"]

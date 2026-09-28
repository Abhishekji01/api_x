"""``/v1/validation`` and ``/v1/pipeline`` against the real, seeded database."""

from __future__ import annotations

import pytest

from apix_api.routers.validation import SWEEP_TIMES_LOCAL
from apix_scheduler.flows.daily_sweep import _DEFAULT_SWEEP_TIMES
from tests.api.conftest import DAILY_ROUTE_SERIES, DAILY_WINDOW_DAYS
from tests.conftest import requires_docker

pytestmark = [pytest.mark.integration, requires_docker]


async def test_daily_series_is_published_with_its_evidence(api_async_client) -> None:
    body = (await api_async_client.get(f"/v1/index?series={DAILY_ROUTE_SERIES}&freq=D")).json()
    items = body["items"]
    assert len(items) >= DAILY_WINDOW_DAYS - 5  # a day a cell cannot index is absent, not faked
    assert items[0]["value"] == pytest.approx(100.0)
    assert all(item["n_quotes"] > 0 for item in items)


async def test_validation_is_honest_about_missing_benchmarks(api_async_client) -> None:
    body = (await api_async_client.get("/v1/validation?series=APIX.ROUTE.DEL-BOM.D")).json()
    assert body["data_origin"] == "SYNTHETIC"
    assert body["apix_daily"][0]["index_value"] == pytest.approx(100.0)
    by_code = {b["code"]: b for b in body["benchmarks"]}
    for code in ("CPI_AIRFARE", "DGCA_AVG_FARE"):
        assert by_code[code]["status"] == "NOT_LOADED"
        assert by_code[code]["points"] == []
        assert by_code[code]["score"] is None
        assert by_code[code]["how_to_load"]
    unit_value = by_code["UNIT_VALUE"]
    assert unit_value["status"] == "COMPUTED"
    assert unit_value["score"]["n_periods"] == len(body["apix_daily"])
    assert -1.0 <= unit_value["score"]["correlation"] <= 1.0


async def test_pipeline_reports_every_stage_and_source(api_async_client) -> None:
    body = (await api_async_client.get("/v1/pipeline")).json()
    stages = {s["key"]: s["count"] for s in body["stages"]}
    assert stages["collected"] >= stages["window"] > 0
    assert stages["clean"] >= stages["outliers"]
    assert body["data_origin"] == "SYNTHETIC"
    assert body["sources"], "every source that exists is listed, collecting or not"
    for source in body["sources"]:
        assert source["quotes_total"] >= 0
    assert body["safeguards"]


def test_pipeline_sweep_times_match_the_scheduler() -> None:
    assert SWEEP_TIMES_LOCAL == _DEFAULT_SWEEP_TIMES

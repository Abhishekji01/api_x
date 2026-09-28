# APIx — Real-time Airfare Price Index for India

APIx collects airfare quotes from Indian airline and OTA websites, cleans and normalises them, and computes an official-quality price index intended for MoSPI and the RBI to augment the Transport sub-group of the Consumer Price Index.

It is a statistical production system, not a flight-price tracker. The output is a number a national statistics office must be willing to publish, and that constraint drives every design decision here. See [CLAUDE.md](CLAUDE.md) for the full contract.

## How this maps to problem statement 26056

| The problem statement asks for | Where it is |
| --- | --- |
| (a) Ethical, multi-source scraping engine, scheduled daily | `apps/collector` (Scrapy/Playwright spiders for IndiGo, Akasa, Cleartrip), `apps/scheduler/flows/daily_sweep.py` (4 sweeps/day), `packages/apix_core/policy` (robots.txt, rate limits, ToS gating, CAPTCHA stop). Dashboard: **Pipeline & ethics**. |
| (b) Cleaned, de-duplicated fare database with full metadata | `packages/apix_core/clean` (dedup, base/tax/UDF/fee split, outliers, sold-out imputation), `fare_quote` → `fare_quote_clean`. Dashboard: **Data**, **Audit trail**. |
| (c) Index module on the given routes and weights | `packages/apix_core/index` (GEKS-Törnqvist, booking-profile and DGCA passenger weights), `config/basket.yaml` (50 city-pairs, 7 booking windows). |
| (d) Interactive dashboard with the **daily** index | `apps/web`: daily headline, sector heatmap, lead-time curves, route explorer. Daily series from `make daily-index-run`. |
| API for NSO and RBI | FastAPI, OpenAPI 3.1 + SDMX-JSON 2.0 (`/docs`). Dashboard: **API**. |
| Documentation, automated testing | This README, `docs/`, ADRs; pytest (unit + integration), Playwright end-to-end, CI. |
| ≥ 30 days back-tested against DGCA average fares | `/v1/validation` + dashboard **Validation**: APIx vs MoSPI CPI air fare, DGCA average fare, and a unit-value mean, scored on correlation, error and direction. |

## Status

| Area | State |
| --- | --- |
| Collection engine, compliance, scheduling | Built and tested. Every real source ships **disabled** until a human records its terms-of-service review, so today every fetch replays a recorded fixture through the real PolicyEngine ([ADR 0003](docs/adr/0003-fixture-replay-over-loopback.md)). |
| Cleaning and index maths | Built and tested against hand-computed and synthetic ground-truth cases. |
| Monthly and **daily** publication | `make index-run` (monthly) and `make daily-index-run` (daily headline + route, window and carrier-type series), with full lineage. |
| DGCA passenger weights | Loaded from the July 2026 release (`db/seeds/dgca/2026-07.csv`). |
| Official benchmarks (MoSPI CPI air fare, DGCA average fares) | Loaders and the eSankhyiki fetcher are ready; **data not loaded yet** (see [docs/data-sources.md](docs/data-sources.md)). The Validation page says so rather than estimating. |
| Data | The dashboard currently runs on the **labelled synthetic dataset** (`make seed-synthetic`), and says so on every page. |

## Run it

```bash
cp .env.example .env      # edit the CHANGEME values
make up                   # compose up --wait, then migrate
```

Then the API is at <http://localhost:8000/docs> and the dashboard at <http://localhost:5173>.

To fill it with the labelled synthetic dataset and publish both series:

```bash
make seed && make seed-synthetic DAYS=90
make index-run DATE=2026-09-27 INDEX_RUN_DAYS=90
make daily-index-run DATE=2026-09-27 DAILY_INDEX_DAYS=60
```

### The static demo (deploy anywhere, no backend)

`apps/web` also builds a **static demo**: the complete dashboard reading a recorded
snapshot of real API responses (`apps/web/demo-snapshot/`), so it can be hosted on
Netlify, Vercel or GitHub Pages for free, and never goes down during a review.

```bash
make demo-snapshot KEY=<researcher key>   # record responses from the running API
make demo-build                           # -> apps/web/dist-demo
```

* **Netlify:** import the repo; `netlify.toml` already sets base, build and publish.
* **Vercel:** import the repo, set *Root Directory* to `apps/web`; `vercel.json` does the rest.
* **GitHub Pages:** Settings → Pages → Source: *GitHub Actions*; `.github/workflows/pages.yml` deploys on every push to `main`.

The web image's API URL is a **build** argument (`VITE_APIX_API_URL`), because Vite
inlines it at build time; an already-built image can be pointed elsewhere by replacing
`/config.js` (see `infra/docker/web.Dockerfile`).

Requires Docker with Compose v2, and [uv](https://docs.astral.sh/uv/) for the local Python toolchain.

## Develop

```bash
make install          # resolve and install the workspace into .venv
make lint             # ruff check + ruff format --check + mypy (strict on apix_core)
make test             # pytest with the >=80% coverage gate on apix_core
make test-integration # tests needing a container runtime (Postgres, Redis);
                      # or APIX_TEST_DATABASE_URL=<empty Postgres DB> without Docker
make seed             # airports, carriers, the route basket, and sources
make collect-once ROUTE=DEL-BOM  # run all three spiders against fixtures for one route
make openapi          # regenerate docs/openapi.json for the front end
make down
```

`make test` skips the container-backed tests when no runtime is present, so it is useful on a laptop and complete in CI. No test in this repository touches the live internet.

## Repository map

```text
apix/
├── CLAUDE.md                   the contract for this repository; read it first
├── compose.yml                 postgres+timescale, redis, api, web, prefect, migrate
├── pyproject.toml              uv workspace root; every dependency pinned exactly
├── Makefile                    the commands above
├── alembic.ini                 URL comes from the environment, never from this file
│
├── packages/apix_core/         the shared library — depends on nothing else in here
│   └── src/apix_core/
│       ├── settings.py         env-var settings, validated; robots compliance is
│       │                       rejected at load time if switched off
│       ├── config/             Pydantic schemas + loaders for config/*.yaml
│       ├── models/             SQLAlchemy 2.0 models — the single data-model definition
│       ├── policy/             PolicyEngine: the ONLY egress path to a source site
│       ├── clean/              normalisation, outliers, imputation      (Phase 2)
│       ├── index/              elementary, multilateral, hedonics       (Phase 3)
│       ├── nowcast/            bridge model                             (Phase 4)
│       └── provenance/         index value -> quotes -> source          (Phase 3)
│
├── apps/
│   ├── api/                    FastAPI service; OpenAPI 3.1 + SDMX-JSON 2.0
│   ├── collector/              Scrapy-style spiders + Playwright; fixture-replay today
│   ├── scheduler/              Prefect 3 flows — daily_sweep
│   └── web/                    React 18 + Vite + TS + TanStack + ECharts
│
├── config/
│   ├── basket.yaml             50 directional city-pairs, AP windows, basket version
│   ├── sources.yaml            one entry per source with its full compliance position
│   └── method.yaml             the index method, as hashed data
│
├── db/
│   ├── migrations/             Alembic; forward-only, never edit an applied revision
│   └── seeds/                  real reference data (airports, carriers)
│
├── infra/docker/               multi-stage, non-root images for api, collector, web
├── fixtures/                   recorded responses (docs/fixtures.md) + synthetic dataset
├── tests/                      mirrors the source tree
└── docs/
    ├── adr/                    architecture decision records
    ├── methodology.md          GENERATED from config/method.yaml — never hand-edited
    └── openapi.json            GENERATED by `make openapi`
```

## The five things this repository will not do

Enforced in code and asserted by tests, not left to a reviewer's memory:

1. **No number without provenance.** `/v1/provenance/{quote_id}` resolves any observation to its source, timestamp and legal basis. `index_value` is keyed by `index_run`, so vintages survive and revisions are visible rather than silent.
2. **Nothing fails silently.** `fare_quote_clean` has check constraints that reject an outlier without a rule, an imputation without a method, or a row with neither a raw quote behind it nor an imputation flag. `/v1/coverage` reports gaps as data.
3. **Compliance is code.** Every outbound request goes through `PolicyEngine.request` (or, when a browser must do the fetching, `PolicyEngine.check` first — see ADR 0003). `PolicyEngine` refuses to even start around a config where an enabled source lacks a `PERMITTED`, recently-reviewed ToS verdict. `APIX_RESPECT_ROBOTS=false` is rejected at settings load. Every real source ships disabled today, pending legal review.
4. **Reproducibility.** An index run is stamped with a `data_snapshot` id and a `method_config` hash. The same stamp must produce byte-identical output.
5. **No fabricated data.** Every `dgca_pax_share` comes from a cited DGCA release, and `BasketConfig` rejects a partially-populated weight vector, so the basket cannot become half-real. A benchmark that is not loaded is reported as not loaded.

`fare_quote` is append-only, enforced by PostgreSQL rules that make `UPDATE` and `DELETE` no-ops. Corrections happen in `fare_quote_clean` and are logged.

## Data model at a glance

```text
airport ─┬─> route ──┬─> fare_quote ──> fare_quote_clean ──> index_value
carrier ─┘           │        ▲                 │                 ▲
                     │        │                 │                 │
source ──> source_policy      │           data_snapshot ──> index_run <── method_config
  │                           │                                   │
  ├──> policy_decision        │                              revision_log
  └──> collection_run ────────┘                              nowcast_value
```

`fare_quote` is a TimescaleDB hypertable on `collected_at`. Timescale requires the partition column in every unique index, so its primary key is `(id, collected_at)` and `fare_quote_clean` carries `quote_collected_at` alongside `quote_id` to keep the lineage a real foreign key. See [ADR 0002](docs/adr/0002-why-multilateral-index.md) for the index method, and the docstring on `db/migrations/versions/0001_initial_schema.py` for the schema decisions.

## Next

1. Record the terms-of-service review of the first real source and switch it on, so live collection starts building real daily history.
2. Load MoSPI's CPI air-fare series from eSankhyiki and DGCA's average fares; the Validation page then scores APIx against them automatically.

/**
 * Overview — the daily Airfare Price Index at a glance.
 *
 * Headline: the latest daily value, its day / week / 30-day change, and what it rests
 * on. Then the daily series itself, the week's biggest route movers, the booking curve
 * for a busy route, a two-week sector heatmap of the busiest routes, and the pipeline
 * that produced every number. Every value traces to `/v1/*`.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { IndexPoint } from "../api/client";
import { DAILY_HEADLINE, HEADLINE_SERIES } from "../api/client";
import {
  useBasket,
  useHeatmap,
  useHeatmapDaily,
  useIndexSeries,
  usePipeline,
  useRoutes,
} from "../api/hooks";
import { Card, Fact } from "../components/Card";
import { ChartPanel } from "../components/ChartPanel";
import { DailyIndexChart, trailingMean } from "../components/DailyIndexChart";
import { EChart } from "../components/EChart";
import { LeadTimeBarsPanel } from "../components/LeadTimeBarsPanel";
import { MoversPanel } from "../components/MoversPanel";
import { RouteDayHeatmap, buildHeatmapModel } from "../components/RouteDayHeatmap";
import { RouteMap } from "../components/RouteMap";
import { buildCorridors } from "../lib/corridors";
import { computeMovers } from "../lib/movers";
import {
  formatCount,
  formatDate,
  formatDay,
  formatIndex,
  formatPct,
  formatPeriod,
  pctChange,
} from "../lib/format";
import { useTheme } from "../theme/ThemeContext";
import { baseOption, tooltipDefaults } from "../theme/echartsTheme";

const RANGES = [
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "All", days: Infinity },
] as const;

function Change({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div className="min-w-[88px]">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      {pct === null ? (
        <p className="mt-0.5 text-sm text-ink-2">—</p>
      ) : (
        <p className="tnum mt-0.5 text-base font-semibold text-ink">
          <span aria-hidden="true" className="mr-1 text-xs text-ink-2">
            {pct >= 0 ? "▲" : "▼"}
          </span>
          {formatPct(pct)}
        </p>
      )}
    </div>
  );
}

/** The whole published history as a quiet 7-day-average strip under the headline. */
function TrendStrip({ items }: { items: IndexPoint[] }) {
  const { tokens } = useTheme();
  const option = useMemo(() => {
    const avg = trailingMean(
      items.map((p) => p.value),
      7,
    );
    return {
      ...baseOption(tokens),
      grid: { left: 0, right: 0, top: 8, bottom: 18 },
      xAxis: {
        type: "category",
        data: items.map((p) => formatDay(p.period)),
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: tokens.inkMuted,
          fontSize: tokens.fontSize.xs,
          interval: (i: number) => i === 0 || i === items.length - 1,
          showMinLabel: true,
          showMaxLabel: true,
          alignMinLabel: "left",
          alignMaxLabel: "right",
        },
      },
      yAxis: { type: "value", show: false, scale: true },
      tooltip: {
        ...tooltipDefaults(tokens),
        trigger: "axis",
        valueFormatter: (v: number | null) => (v === null ? "—" : formatIndex(v)),
      },
      series: [
        {
          name: "7-day average",
          type: "line",
          data: avg,
          showSymbol: false,
          lineStyle: { width: 2, color: tokens.series[0] },
          areaStyle: { color: tokens.series[0], opacity: 0.08 },
          markLine: {
            symbol: "none",
            silent: true,
            label: { show: false },
            lineStyle: { color: tokens.axis, type: "dashed", width: 1 },
            data: [{ yAxis: 100 }],
          },
        },
      ],
    };
  }, [items, tokens]);
  return (
    <div className="mt-5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        7-day average since the base day
      </p>
      <EChart
        option={option}
        height={96}
        ariaLabel="Seven-day average of the daily index since the base day"
      />
    </div>
  );
}

export default function Overview() {
  const daily = useIndexSeries(DAILY_HEADLINE, "D");
  const monthly = useIndexSeries(HEADLINE_SERIES, "M");
  const basket = useBasket();
  const routes = useRoutes();
  const heatmapMonthly = useHeatmap();
  const pipeline = usePipeline();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const [leadRoute, setLeadRoute] = useState("DEL-BOM");

  const items = daily.data?.items ?? [];
  const latest = items.at(-1);
  const firstDay = items[0]?.period;
  const heatmapFrom = useMemo(() => {
    const last = latest?.period;
    if (last === undefined) return undefined;
    const d = new Date(`${last}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 20);
    return d.toISOString().slice(0, 10);
  }, [latest?.period]);
  const heatmapDaily = useHeatmapDaily(heatmapFrom);

  const chartItems = useMemo(
    () => (Number.isFinite(range.days) ? items.slice(-range.days) : items),
    [items, range],
  );

  const busiest = useMemo(
    () =>
      [...(basket.data?.routes ?? [])]
        .sort((a, b) => (b.dgca_pax_share ?? 0) - (a.dgca_pax_share ?? 0))
        .map((r) => r.code),
    [basket.data],
  );
  const heatModel = useMemo(
    () =>
      heatmapDaily.data === undefined
        ? null
        : buildHeatmapModel(heatmapDaily.data, busiest.length > 0 ? busiest : undefined, 12, 14),
    [heatmapDaily.data, busiest],
  );
  const weekMovers = useMemo(
    () => computeMovers(heatmapDaily.data, 5, 7),
    [heatmapDaily.data],
  );
  const corridors = useMemo(
    () => buildCorridors(routes.data?.items, heatmapMonthly.data?.items),
    [routes.data, heatmapMonthly.data],
  );

  const at = (offset: number) => items.at(-1 - offset)?.value;
  const monthItems = monthly.data?.items ?? [];
  const monthLatest = monthItems.at(-1);
  const monthPrev = monthItems.at(-2);
  const stage = (key: string) => pipeline.data?.stages.find((s) => s.key === key)?.count;

  return (
    <div className="flex flex-col gap-6">
      {/* Headline */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section
          aria-labelledby="headline"
          className="rounded-xl border border-edge bg-surface p-6 shadow-card lg:col-span-2"
        >
          <p id="headline" className="text-sm font-semibold text-ink-2">
            India Airfare Price Index · daily
          </p>
          {daily.isLoading && <p className="mt-4 text-sm text-ink-2">Loading…</p>}
          {daily.error !== null && daily.error !== undefined && (
            <p className="mt-4 text-sm text-critical-ink" role="alert">
              Could not load the daily index.
            </p>
          )}
          {latest !== undefined && (
            <div className="mt-2 flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <p className="tnum text-5xl font-bold tracking-tight text-ink">
                  {formatIndex(latest.value)}
                </p>
                <p className="mt-1 text-xs text-ink-2">
                  {formatDate(latest.period)} ·{" "}
                  {firstDay !== undefined ? `${formatDate(firstDay)} = 100` : "base = 100"}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3 pb-1">
                <Change label="1 day" pct={pctChange(at(1), at(0))} />
                <Change label="7 days" pct={pctChange(at(7), at(0))} />
                <Change label="30 days" pct={pctChange(at(30), at(0))} />
                <Change
                  label={monthLatest ? `${formatPeriod(monthLatest.period)} vs prior` : "Month"}
                  pct={pctChange(monthPrev?.value, monthLatest?.value)}
                />
              </div>
            </div>
          )}
          {items.length > 7 && <TrendStrip items={items} />}
          {latest !== undefined && (
            <p className="mt-4 border-t border-grid pt-3 text-xs text-ink-2">
              Today&apos;s value rests on{" "}
              <strong className="tnum text-ink">{formatCount(latest.n_quotes)}</strong> fare
              quotes across the basket, with{" "}
              <strong className="tnum text-ink">{latest.coverage_pct?.toFixed(1) ?? "—"}%</strong>{" "}
              of the base day&apos;s flights still matched — the index compares like with like,
              not a changing mix of tickets.
            </p>
          )}
        </section>

        <Card title="At a glance" more={{ to: "/pipeline", label: "Pipeline" }}>
          <dl>
            <Fact
              label="City-pairs in the basket"
              value={basket.data?.routes.length ?? "…"}
              note="Weighted by DGCA passenger traffic"
            />
            <Fact
              label="Advance-purchase windows"
              value={basket.data?.advance_windows.length ?? "…"}
              note="From walk-up (0–3 days) to 61–90 days"
            />
            <Fact label="Days of daily index" value={items.length > 0 ? items.length : "…"} />
            <Fact
              label="Quotes in the current window"
              value={stage("window") !== undefined ? formatCount(stage("window") ?? 0) : "…"}
            />
            <Fact
              label="Collection sweeps per day"
              value={pipeline.data?.sweep_times_local.length ?? "…"}
              note={pipeline.data?.sweep_times_local.join(" · ")}
            />
          </dl>
        </Card>
      </div>

      {/* The daily series */}
      <ChartPanel
        title="Daily Airfare Price Index"
        subtitle="National headline, DGCA-weighted across routes. The 7-day average removes the weekly fare cycle."
        isLoading={daily.isLoading}
        error={daily.error}
        isEmpty={chartItems.length === 0}
        emptyDetail="No daily index has been published yet. Run make daily-index-run after collecting (or seeding) fares."
        toolbar={
          <div className="flex rounded-md border border-edge p-0.5" role="group" aria-label="Range">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={range.label === r.label}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                  range.label === r.label ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
        table={{
          caption: "Daily Airfare Price Index",
          columns: ["Date", "Index", "Quotes", "Matched %"],
          rows: [...chartItems].reverse().map((p) => [
            formatDate(p.period),
            formatIndex(p.value),
            formatCount(p.n_quotes),
            p.coverage_pct?.toFixed(1) ?? "—",
          ]),
        }}
      >
        {chartItems.length > 0 && <DailyIndexChart items={chartItems} />}
      </ChartPanel>

      {/* Movers, booking curve, map */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card
          title="Biggest moves this week"
          subtitle="Route index today vs the same weekday a week ago"
          more={{ to: "/heatmap", label: "Heatmap" }}
        >
          {heatmapDaily.isLoading ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : (
            <MoversPanel movers={weekMovers} comparison="vs 7 days earlier" daily />
          )}
        </Card>
        <LeadTimeBarsPanel
          routeCode={leadRoute}
          carrier=""
          toolbar={
            <select
              aria-label="Route"
              value={leadRoute}
              onChange={(e) => setLeadRoute(e.target.value)}
              className="rounded-md border border-edge bg-surface px-2 py-1 text-xs font-semibold text-ink"
            >
              {(busiest.length > 0 ? busiest : ["DEL-BOM"]).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          }
        />
        <Card
          title="Route momentum"
          subtitle="Corridors coloured by change vs the previous month"
          more={{ to: "/routes", label: "Routes" }}
        >
          {routes.isLoading || heatmapMonthly.isLoading ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : corridors.length === 0 ? (
            <p className="text-sm text-ink-2">No routes with known airport coordinates yet.</p>
          ) : (
            <RouteMap corridors={corridors} compact />
          )}
        </Card>
      </div>

      {/* Heatmap preview + pipeline */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card
          title="Sector heatmap · last 14 days"
          subtitle="The 12 busiest city-pairs. Red: dearer than the route's own average; blue: cheaper."
          more={{ to: "/heatmap", label: "All routes" }}
          className="lg:col-span-2"
        >
          {heatModel === null ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : (
            <RouteDayHeatmap model={heatModel} compact />
          )}
        </Card>
        <Card
          title="From web page to index"
          subtitle="What happened to every quote in the current window"
          more={{ to: "/pipeline", label: "Details" }}
        >
          <ol className="flex flex-col gap-3">
            {(pipeline.data?.stages ?? [])
              .filter((s) => s.key !== "collected")
              .map((s) => {
                const top = stage("window") ?? 1;
                const pct = s.key === "indexed" ? null : Math.min(100, (s.count / Math.max(1, top)) * 100);
                return (
                  <li key={s.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-ink-2">{s.label}</span>
                      <span className="tnum text-sm font-semibold text-ink">{formatCount(s.count)}</span>
                    </div>
                    {pct !== null && (
                      <div className="mt-1 h-1.5 rounded-full bg-raised">
                        <div
                          className="h-1.5 rounded-full bg-accent"
                          style={{ width: `${Math.max(pct, s.count > 0 ? 1.5 : 0)}%` }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
          </ol>
          <p className="mt-4 text-xs text-ink-2">
            Compared against MoSPI&apos;s CPI and DGCA fares on the{" "}
            <Link to="/validation" className="font-semibold text-accent-ink hover:underline">
              Validation
            </Link>{" "}
            page.
          </p>
        </Card>
      </div>
    </div>
  );
}

/**
 * Validation — the problem statement's back-test: "demonstrate at least 30 days of
 * back-tested results against publicly available DGCA monthly average-fare data".
 *
 * Every benchmark from `/v1/validation` gets a scorecard. A benchmark that is not
 * loaded says so and shows the command that loads it; nothing is estimated in its
 * place. When the APIx series itself is synthetic, the page says the scores test the
 * harness, not the world.
 */

import { useMemo } from "react";
import type { Benchmark, SeriesPoint, ValidationScore } from "../api/client";
import { useValidation } from "../api/hooks";
import { Card } from "../components/Card";
import { ChartPanel } from "../components/ChartPanel";
import { EChart } from "../components/EChart";
import { ValidationArt } from "../components/illustrations";
import { PageHeader } from "../components/PageHeader";
import { formatDate, formatDay, formatIndex, formatPeriod } from "../lib/format";
import { useTheme } from "../theme/ThemeContext";
import { baseOption, gridDefaults, timeAxis, tooltipDefaults, valueAxis } from "../theme/echartsTheme";

function StatusPill({ status }: { status: Benchmark["status"] }) {
  const map = {
    LOADED: { label: "Loaded", cls: "bg-good-soft text-good-ink", icon: "✓" },
    COMPUTED: { label: "Computed", cls: "bg-accent-soft text-accent-ink", icon: "∑" },
    NOT_LOADED: { label: "Not loaded yet", cls: "bg-raised text-ink-2 border border-edge", icon: "○" },
  } as const;
  const m = map[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>
      <span aria-hidden="true">{m.icon}</span>
      {m.label}
    </span>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div title={hint}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-xl font-semibold text-ink">{value}</dd>
    </div>
  );
}

function ScoreGrid({ score }: { score: ValidationScore }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <Metric
        label="Correlation"
        value={score.correlation === null ? "—" : score.correlation.toFixed(2)}
        hint="Pearson correlation of the two series, both rebased to 100. 1.00 = move together perfectly."
      />
      <Metric
        label="Mean abs. error"
        value={score.mape === null ? "—" : `${score.mape.toFixed(1)}%`}
        hint="Mean absolute percentage gap between the two rebased series."
      />
      <Metric
        label="Same direction"
        value={score.directional_accuracy === null ? "—" : `${score.directional_accuracy.toFixed(0)}%`}
        hint="Share of period-to-period moves where both series went up or down together."
      />
      <Metric label="Periods" value={String(score.n_periods)} hint={score.note} />
    </dl>
  );
}

function BenchmarkCard({ b }: { b: Benchmark }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-edge bg-surface p-5 shadow-card">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{b.label}</h3>
          <p className="mt-0.5 text-xs text-ink-2">{b.source}</p>
        </div>
        <StatusPill status={b.status} />
      </header>
      {b.score !== null && b.score !== undefined ? (
        <ScoreGrid score={b.score} />
      ) : (
        <p className="text-sm text-ink-2">No score yet — nothing is estimated in its place.</p>
      )}
      <p className="text-xs leading-relaxed text-ink-2">{b.note}</p>
      {b.how_to_load !== null && b.how_to_load !== undefined && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">To load</p>
          <code className="block overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-raised px-3 py-2 font-mono text-[11px] text-ink">
            {b.how_to_load}
          </code>
        </div>
      )}
    </section>
  );
}

function useComparisonOption(
  lines: { name: string; points: SeriesPoint[]; slot: number; dashed?: boolean }[],
  daily: boolean,
) {
  const { tokens } = useTheme();
  return useMemo(() => {
    const periods = [...new Set(lines.flatMap((l) => l.points.map((p) => p.period)))].sort();
    if (periods.length === 0) return null;
    const fmt = daily ? formatDay : formatPeriod;
    const all = lines.flatMap((l) => l.points.map((p) => p.index_value));
    const lo = Math.floor(Math.min(100, ...all) / 5) * 5;
    const hi = Math.ceil(Math.max(100, ...all) / 5) * 5;
    return {
      ...baseOption(tokens),
      grid: { ...gridDefaults(), left: 56, right: 16, top: 40, bottom: 32 },
      legend: {
        top: 0,
        left: 0,
        icon: "roundRect",
        itemWidth: 14,
        itemHeight: 3,
        textStyle: { color: tokens.inkSecondary, fontFamily: tokens.fontFamily, fontSize: tokens.fontSize.sm },
      },
      tooltip: {
        ...tooltipDefaults(tokens),
        trigger: "axis",
        valueFormatter: (v: number | null) => (v === null || v === undefined ? "—" : formatIndex(v)),
      },
      xAxis: {
        ...timeAxis(tokens),
        data: periods.map(fmt),
        boundaryGap: !daily,
        axisLabel: { ...timeAxis(tokens).axisLabel, interval: daily ? Math.max(0, Math.floor(periods.length / 8) - 1) : 0 },
      },
      yAxis: { ...valueAxis(tokens), min: lo, max: hi, name: undefined },
      series: lines.map((l) => {
        const byPeriod = new Map(l.points.map((p) => [p.period, p.index_value]));
        const color = tokens.series[l.slot] ?? tokens.inkMuted;
        return {
          name: l.name,
          type: "line",
          data: periods.map((p) => byPeriod.get(p) ?? null),
          showSymbol: !daily,
          symbolSize: 8,
          connectNulls: false,
          lineStyle: { width: 2, color, type: l.dashed === true ? "dashed" : "solid" },
          itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
        };
      }),
    };
  }, [lines, daily, tokens]);
}

export default function Validation() {
  const validation = useValidation();
  const data = validation.data;
  const byCode = useMemo(
    () => new Map((data?.benchmarks ?? []).map((b) => [b.code, b])),
    [data],
  );
  const unit = byCode.get("UNIT_VALUE");
  const cpi = byCode.get("CPI_AIRFARE");
  const dgca = byCode.get("DGCA_AVG_FARE");
  const synthetic = data?.data_origin === "SYNTHETIC" || data?.data_origin === "MIXED";

  const dailyLines = useMemo(
    () => [
      { name: "APIx (daily)", points: data?.apix_daily ?? [], slot: 0 },
      { name: "Plain average fare, same quotes", points: unit?.points ?? [], slot: 1 },
    ],
    [data, unit],
  );
  const monthlyLines = useMemo(() => {
    const lines: { name: string; points: SeriesPoint[]; slot: number; dashed?: boolean }[] = [
      { name: "APIx (monthly mean)", points: data?.apix_monthly ?? [], slot: 0 },
    ];
    if (cpi !== undefined && cpi.points.length > 0)
      lines.push({ name: "CPI air fare (MoSPI)", points: cpi.points, slot: 2 });
    if (dgca !== undefined && dgca.points.length > 0)
      lines.push({ name: "DGCA average fare", points: dgca.points, slot: 3, dashed: true });
    return lines;
  }, [data, cpi, dgca]);

  const dailyOption = useComparisonOption(dailyLines, true);
  const monthlyOption = useComparisonOption(monthlyLines, false);
  const nDays = data?.apix_daily.length ?? 0;
  const loadedOfficial = [cpi, dgca].filter((b) => b?.status === "LOADED").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Validation"
        subtitle="Does APIx move with what Indian travellers actually pay? The daily index is scored against MoSPI's CPI air-fare index, DGCA's published average fares, and a plain average of the same quotes."
        art={<ValidationArt />}
      />

      {synthetic && (
        <div className="rounded-xl border border-warning-ink/25 bg-warning-soft p-4 text-sm text-ink">
          <p className="font-semibold text-warning-ink">These scores test the harness, not real prices.</p>
          <p className="mt-1 text-ink-2">
            The APIx series on this page is computed from labelled synthetic fares. The scoring code is
            the real back-test: once collected fares flow in and the official benchmarks are loaded, the
            same page scores APIx against MoSPI and DGCA with no code change.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-edge bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-2">Days back-tested</p>
          <p className="tnum mt-1 text-3xl font-bold text-ink">{validation.isLoading ? "…" : nDays}</p>
          <p className="mt-1 text-[11px] text-ink-muted">Problem statement asks for at least 30</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-2">Official benchmarks loaded</p>
          <p className="tnum mt-1 text-3xl font-bold text-ink">
            {validation.isLoading ? "…" : `${loadedOfficial} of 2`}
          </p>
          <p className="mt-1 text-[11px] text-ink-muted">MoSPI CPI air fare · DGCA average fare</p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-2">Period covered</p>
          <p className="mt-1 text-base font-semibold text-ink">
            {nDays > 0 ? `${formatDate(data!.apix_daily[0]!.period)} –` : "…"}
          </p>
          <p className="text-base font-semibold text-ink">
            {nDays > 0 ? formatDate(data!.apix_daily.at(-1)!.period) : ""}
          </p>
        </div>
        <div className="rounded-xl border border-edge bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-2">Minimum periods to score</p>
          <p className="tnum mt-1 text-3xl font-bold text-ink">{data?.min_periods_for_score ?? "…"}</p>
          <p className="mt-1 text-[11px] text-ink-muted">Below this, no correlation is reported</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {[cpi, dgca, unit].map((b) => (b === undefined ? null : <BenchmarkCard key={b.code} b={b} />))}
      </div>

      <ChartPanel
        title="Monthly: APIx against the official series"
        subtitle="Every series rebased to 100 in its first month, so an index and a rupee average share one scale."
        isLoading={validation.isLoading}
        error={validation.error}
        isEmpty={monthlyOption === null}
        table={{
          caption: "Monthly comparison, rebased to 100",
          columns: ["Series", "Month", "Value (own unit)", "Rebased"],
          rows: monthlyLines.flatMap((l) =>
            l.points.map((p) => [l.name, formatPeriod(p.period), p.value.toFixed(2), formatIndex(p.index_value)]),
          ),
        }}
      >
        {monthlyOption !== null && (
          <>
            <EChart option={monthlyOption} height={280} ariaLabel="Monthly APIx against the official CPI and DGCA series, rebased to 100" />
            {loadedOfficial === 0 && (
              <p className="mt-3 rounded-md bg-raised px-3 py-2 text-xs text-ink-2">
                Only APIx is drawn: neither official series is loaded yet. Their lines appear here as soon
                as they are — see the scorecards above for the one-line commands.
              </p>
            )}
          </>
        )}
      </ChartPanel>

      <ChartPanel
        title="Daily: APIx against a plain average fare"
        subtitle="Both from the same quotes, both rebased to 100 on the first day."
        isLoading={validation.isLoading}
        error={validation.error}
        isEmpty={dailyOption === null}
        table={{
          caption: "Daily comparison, rebased to 100",
          columns: ["Series", "Date", "Rebased"],
          rows: dailyLines.flatMap((l) =>
            l.points.map((p) => [l.name, formatDate(p.period), formatIndex(p.index_value)]),
          ),
        }}
      >
        {dailyOption !== null && (
          <EChart option={dailyOption} height={300} ariaLabel="Daily APIx against a plain average fare, rebased to 100" />
        )}
      </ChartPanel>

      <Card title="How the back-test works">
        <ol className="grid grid-cols-1 gap-4 text-sm text-ink-2 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["Common base", "APIx and each benchmark are rebased to 100 at their first shared period — an index and a rupee average become comparable."],
            ["Correlation", "Do they rise and fall together? Pearson correlation on the rebased series, over overlapping periods only."],
            ["Error", "Mean absolute percentage gap between the two rebased lines — how far apart they drift."],
            ["Direction", "Share of period-to-period moves where both went the same way — the signal a policymaker reads first."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">
                {i + 1}
              </span>
              <span>
                <strong className="block text-ink">{t}</strong>
                {d}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-grid pt-3 text-xs text-ink-2">
          Why a plain average is not enough: it moves whenever the mix of routes and booking windows sampled
          that day changes, even if no price changed. APIx compares the same flights day to day, so the gap
          between the two daily lines is the mix effect the index removes.
        </p>
      </Card>
    </div>
  );
}

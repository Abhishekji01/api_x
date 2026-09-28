/**
 * Daily index — the headline in full, and the two breakdowns a price statistician asks
 * for first: by how far ahead the ticket is bought, and by carrier type.
 */

import { useMemo, useState } from "react";
import type { IndexPoint } from "../api/client";
import { DAILY_HEADLINE, HEADLINE_SERIES } from "../api/client";
import { useIndexSeries } from "../api/hooks";
import { Card } from "../components/Card";
import { ChartPanel } from "../components/ChartPanel";
import { DailyIndexChart } from "../components/DailyIndexChart";
import { OverviewArt } from "../components/illustrations";
import { PageHeader } from "../components/PageHeader";
import { formatCount, formatDate, formatIndex, formatPct, formatPeriod, pctChange } from "../lib/format";

const WINDOWS = [
  { code: "AP04_07", label: "4–7 days ahead" },
  { code: "AP15_21", label: "15–21 days ahead" },
  { code: "AP31_60", label: "31–60 days ahead" },
] as const;

const CARRIER_TYPES = [
  { code: "LCC", label: "Low-cost carriers" },
  { code: "FSC", label: "Full-service carriers" },
] as const;

/** Align a sub-index to the headline's days; a day it lacks is a gap, never filled. */
function alignTo(base: IndexPoint[], other: IndexPoint[] | undefined): (number | null)[] {
  const byDay = new Map((other ?? []).map((p) => [p.period, p.value]));
  return base.map((p) => byDay.get(p.period) ?? null);
}

export default function AirfareIndex() {
  const headline = useIndexSeries(DAILY_HEADLINE, "D");
  const monthly = useIndexSeries(HEADLINE_SERIES, "M");
  const w0 = useIndexSeries(`APIX.WINDOW.${WINDOWS[0].code}.D`, "D");
  const w1 = useIndexSeries(`APIX.WINDOW.${WINDOWS[1].code}.D`, "D");
  const w2 = useIndexSeries(`APIX.WINDOW.${WINDOWS[2].code}.D`, "D");
  const c0 = useIndexSeries(`APIX.CARRIERTYPE.${CARRIER_TYPES[0].code}.D`, "D");
  const c1 = useIndexSeries(`APIX.CARRIERTYPE.${CARRIER_TYPES[1].code}.D`, "D");
  const [showAverage, setShowAverage] = useState(true);

  const items = headline.data?.items ?? [];

  const windowSeries = useMemo(
    () =>
      [w0, w1, w2].map((q, i) => ({
        name: WINDOWS[i]!.label,
        values: alignTo(items, q.data?.items),
      })),
    [items, w0.data, w1.data, w2.data], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const carrierSeries = useMemo(
    () =>
      [c0, c1].map((q, i) => ({
        name: CARRIER_TYPES[i]!.label,
        values: alignTo(items, q.data?.items),
      })),
    [items, c0.data, c1.data], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const monthRows = [...(monthly.data?.items ?? [])].reverse();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daily Airfare Price Index"
        subtitle="A chained, matched-sample index of domestic fares: each route and booking window compares the same flights day to day (GEKS-Törnqvist), then routes are combined with DGCA passenger-traffic weights."
        art={<OverviewArt />}
      />

      <ChartPanel
        title="National index, by day"
        subtitle={
          items.length > 0
            ? `${formatDate(items[0]!.period)} to ${formatDate(items.at(-1)!.period)} · ${items.length} days · first day = 100`
            : undefined
        }
        isLoading={headline.isLoading}
        error={headline.error}
        isEmpty={items.length === 0}
        toolbar={
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={showAverage}
              onChange={(e) => setShowAverage(e.target.checked)}
            />
            7-day average
          </label>
        }
        table={{
          caption: "Daily Airfare Price Index",
          columns: ["Date", "Index", "Change on day", "Quotes", "Matched %"],
          rows: [...items].reverse().map((p, i, arr) => {
            const prev = arr[i + 1];
            const ch = pctChange(prev?.value, p.value);
            return [
              formatDate(p.period),
              formatIndex(p.value),
              ch === null ? "—" : formatPct(ch),
              formatCount(p.n_quotes),
              p.coverage_pct?.toFixed(1) ?? "—",
            ];
          }),
        }}
      >
        {items.length > 0 && <DailyIndexChart items={items} height={380} showAverage={showAverage} />}
      </ChartPanel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartPanel
          title="By booking window"
          subtitle="Late bookings swing hardest — that is the dynamic pricing the manual CPI collection misses."
          isLoading={headline.isLoading || w0.isLoading}
          isEmpty={items.length === 0}
        >
          {items.length > 0 && (
            <DailyIndexChart items={items} extra={windowSeries} showAverage={false} height={300} />
          )}
        </ChartPanel>
        <ChartPanel
          title="By carrier type"
          subtitle="Low-cost and full-service carriers, each on the same base."
          isLoading={headline.isLoading || c0.isLoading}
          isEmpty={items.length === 0}
        >
          {items.length > 0 && (
            <DailyIndexChart items={items} extra={carrierSeries} showAverage={false} height={300} />
          )}
        </ChartPanel>
      </div>

      <Card
        title="Monthly publication"
        subtitle="The monthly series APIx would hand to the CPI, published with its evidence base. Revisions are kept, never overwritten."
      >
        {monthRows.length === 0 ? (
          <p className="text-sm text-ink-2">No monthly period published yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs text-ink-2">
                  <th className="py-2 pr-4 font-semibold">Month</th>
                  <th className="py-2 pr-4 text-right font-semibold">Index</th>
                  <th className="py-2 pr-4 text-right font-semibold">Quotes</th>
                  <th className="py-2 pr-4 text-right font-semibold">Coverage</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map((p) => (
                  <tr key={p.period} className="border-b border-grid last:border-0">
                    <td className="py-2 pr-4 text-ink">{formatPeriod(p.period)}</td>
                    <td className="tnum py-2 pr-4 text-right font-semibold text-ink">{formatIndex(p.value)}</td>
                    <td className="tnum py-2 pr-4 text-right text-ink-2">{formatCount(p.n_quotes)}</td>
                    <td className="tnum py-2 pr-4 text-right text-ink-2">
                      {p.coverage_pct === null || p.coverage_pct === undefined ? "reference" : `${p.coverage_pct.toFixed(1)}%`}
                    </td>
                    <td className="py-2 text-xs text-ink-2">{p.status.toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

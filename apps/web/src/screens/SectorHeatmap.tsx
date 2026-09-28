/**
 * Sector heatmap — every basket route by day, coloured by that day's deviation from the
 * route's own average over the window. Rows are ordered by DGCA passenger traffic.
 */

import { useMemo, useState } from "react";
import { DAILY_HEADLINE } from "../api/client";
import { useBasket, useHeatmapDaily, useIndexSeries } from "../api/hooks";
import { ChartPanel } from "../components/ChartPanel";
import { HeatmapArt } from "../components/illustrations";
import { PageHeader } from "../components/PageHeader";
import { RouteDayHeatmap, buildHeatmapModel } from "../components/RouteDayHeatmap";
import { formatDate, formatIndex } from "../lib/format";

const WINDOWS = [
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
] as const;

export default function SectorHeatmap() {
  const basket = useBasket();
  const headline = useIndexSeries(DAILY_HEADLINE, "D");
  const [span, setSpan] = useState<(typeof WINDOWS)[number]>(WINDOWS[1]);
  const [limit, setLimit] = useState<25 | 50>(25);

  const firstDay = headline.data?.items[0]?.period;
  const heatmap = useHeatmapDaily(firstDay);

  const busiest = useMemo(
    () =>
      [...(basket.data?.routes ?? [])]
        .sort((a, b) => (b.dgca_pax_share ?? 0) - (a.dgca_pax_share ?? 0))
        .map((r) => r.code),
    [basket.data],
  );

  const model = useMemo(
    () =>
      heatmap.data === undefined
        ? null
        : buildHeatmapModel(heatmap.data, busiest.length > 0 ? busiest : undefined, limit, span.days),
    [heatmap.data, busiest, limit, span],
  );

  const table = useMemo(() => {
    if (model === null) return undefined;
    return {
      caption: "Route index by day, and its deviation from the route's own average",
      columns: ["Route", "Date", "Route index", "vs route average", "Quotes"],
      rows: model.cells.map((c) => [
        c.route,
        formatDate(c.day),
        formatIndex(c.value),
        `${c.deviationPct >= 0 ? "+" : ""}${c.deviationPct.toFixed(1)}%`,
        c.nQuotes.toLocaleString("en-IN"),
      ]),
    };
  }, [model]);

  const toggle = (active: boolean) =>
    `rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
      active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:text-ink"
    }`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sector heatmap"
        subtitle="Which city-pairs were dear or cheap, day by day. Each cell compares a route with its own average over the window, so a trunk route and a regional one are read on the same scale."
        art={<HeatmapArt />}
      />
      <ChartPanel
        title={`Routes by day · ${model?.routes.length ?? "…"} busiest city-pairs`}
        subtitle="Ordered by DGCA passenger traffic. Red: dearer than the route's average; blue: cheaper."
        isLoading={heatmap.isLoading || headline.isLoading}
        error={heatmap.error}
        isEmpty={model?.cells.length === 0}
        table={table}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-md border border-edge p-0.5" role="group" aria-label="Window">
              {WINDOWS.map((w) => (
                <button
                  key={w.label}
                  type="button"
                  aria-pressed={span.label === w.label}
                  onClick={() => setSpan(w)}
                  className={toggle(span.label === w.label)}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border border-edge p-0.5" role="group" aria-label="Routes">
              {([25, 50] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={limit === n}
                  onClick={() => setLimit(n)}
                  className={toggle(limit === n)}
                >
                  {n === 50 ? "All 50" : "Top 25"}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {model !== null && <RouteDayHeatmap model={model} />}
      </ChartPanel>
    </div>
  );
}

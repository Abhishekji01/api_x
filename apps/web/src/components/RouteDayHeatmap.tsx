/**
 * Routes x days, each cell coloured by how far that day's route index sits from the
 * route's own average over the window shown (diverging, centred on zero). Relative to
 * its own average, so a busy trunk route and a thin regional one are read on the same
 * scale: "was this a dear day for this route?".
 */

import { useMemo } from "react";
import type { HeatmapCell } from "../api/client";
import { formatDate, formatDay, formatIndex } from "../lib/format";
import { useTheme } from "../theme/ThemeContext";
import { baseOption, chartText, divergingRamp, tooltipDefaults } from "../theme/echartsTheme";
import { EChart } from "./EChart";

export interface HeatmapModel {
  routes: string[];
  days: string[];
  cells: { route: string; day: string; value: number; deviationPct: number; nQuotes: number }[];
  maxAbs: number;
}

/** Build the grid; ``routeOrder`` (e.g. busiest first) decides rows and truncation. */
export function buildHeatmapModel(
  items: HeatmapCell[],
  routeOrder: string[] | undefined,
  maxRoutes: number,
  lastDays: number,
): HeatmapModel {
  const allDays = [...new Set(items.map((c) => c.period))].sort();
  const days = allDays.slice(-lastDays);
  const daySet = new Set(days);
  const present = new Set(items.map((c) => c.route_code));
  const ordered = (routeOrder ?? [...present].sort()).filter((r) => present.has(r));
  const routes = ordered.slice(0, maxRoutes);
  const routeSet = new Set(routes);
  const inWindow = items.filter((c) => daySet.has(c.period) && routeSet.has(c.route_code));

  const mean = new Map<string, number>();
  for (const route of routes) {
    const vals = inWindow.filter((c) => c.route_code === route).map((c) => c.value);
    if (vals.length > 0) mean.set(route, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  const cells = inWindow.map((c) => {
    const m = mean.get(c.route_code) ?? c.value;
    return {
      route: c.route_code,
      day: c.period,
      value: c.value,
      deviationPct: ((c.value - m) / m) * 100,
      nQuotes: c.n_quotes,
    };
  });
  const maxAbs = Math.max(
    5,
    Math.ceil(Math.max(0, ...cells.map((c) => Math.abs(c.deviationPct))) / 5) * 5,
  );
  return { routes, days, cells, maxAbs };
}

interface RouteDayHeatmapProps {
  model: HeatmapModel;
  compact?: boolean;
}

export function RouteDayHeatmap({ model, compact = false }: RouteDayHeatmapProps) {
  const { tokens } = useTheme();
  const { routes, days, cells, maxAbs } = model;
  const rowHeight = compact ? 20 : 22;
  const height = routes.length * rowHeight + (compact ? 70 : 90);

  const option = useMemo(() => {
    const cellIndex = new Map(cells.map((c, i) => [`${c.route}|${c.day}`, i]));
    const data = cells.map((c) => [
      days.indexOf(c.day),
      routes.indexOf(c.route),
      Math.round(c.deviationPct * 10) / 10,
    ]);
    return {
      ...baseOption(tokens),
      grid: { left: 72, right: 12, top: 8, bottom: compact ? 58 : 70 },
      tooltip: {
        ...tooltipDefaults(tokens),
        trigger: "item",
        formatter: (params: { data: [number, number, number] }) => {
          const [d, r] = params.data;
          const cell = cells[cellIndex.get(`${routes[r]}|${days[d]}`) ?? -1];
          if (cell === undefined) return "";
          const sign = cell.deviationPct >= 0 ? "+" : "";
          return `<b>${cell.route}</b> · ${formatDate(cell.day)}<br/>Route index ${formatIndex(cell.value)}<br/>${sign}${cell.deviationPct.toFixed(1)}% vs its ${days.length}-day average<br/><span style="color:${tokens.inkMuted}">${cell.nQuotes} quotes</span>`;
        },
      },
      xAxis: {
        type: "category",
        data: days.map(formatDay),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...chartText(tokens),
          color: tokens.inkMuted,
          interval: Math.max(0, Math.ceil(days.length / (compact ? 5 : 10)) - 1),
        },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: routes,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...chartText(tokens), color: tokens.inkPrimary },
        splitArea: { show: false },
      },
      visualMap: {
        type: "continuous",
        min: -maxAbs,
        max: maxAbs,
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemHeight: compact ? 160 : 240,
        itemWidth: 10,
        text: [`${maxAbs}% dearer`, `${maxAbs}% cheaper`],
        textStyle: { ...chartText(tokens), fontSize: tokens.fontSize.xs },
        inRange: { color: divergingRamp(tokens) },
      },
      series: [
        {
          type: "heatmap",
          data,
          itemStyle: { borderColor: tokens.surface, borderWidth: 2, borderRadius: 3 },
          emphasis: { itemStyle: { borderColor: tokens.inkPrimary, borderWidth: 1 } },
        },
      ],
    };
  }, [cells, days, routes, maxAbs, tokens, compact]);

  const nav = useMemo(
    () => ({
      seriesCount: 1,
      pointCount: () => cells.length,
      describe: (_s: number, d: number) => {
        const c = cells[d];
        if (c === undefined) return "";
        return `${c.route}, ${formatDate(c.day)}: ${c.deviationPct >= 0 ? "+" : ""}${c.deviationPct.toFixed(1)}% versus its average.`;
      },
    }),
    [cells],
  );

  return (
    <EChart
      option={option}
      height={height}
      ariaLabel="Heatmap of routes by day, coloured by each day's deviation from that route's own average"
      nav={nav}
    />
  );
}

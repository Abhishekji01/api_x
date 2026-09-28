/**
 * The daily headline: APIx by day with a trailing 7-day average and the base line at
 * 100. One axis, one unit (index points). The 7-day average is the reading to trust —
 * airfares have a strong day-of-week cycle, and a week-long window cancels it exactly.
 */

import { useMemo } from "react";
import type { IndexPoint } from "../api/client";
import { formatCount, formatDate, formatDay, formatIndex } from "../lib/format";
import { useTheme } from "../theme/ThemeContext";
import { baseOption, gridDefaults, timeAxis, tooltipDefaults, valueAxis } from "../theme/echartsTheme";
import { EChart } from "./EChart";

export function trailingMean(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

interface DailyIndexChartProps {
  items: IndexPoint[];
  referenceValue?: number;
  height?: number;
  /** Extra series drawn on the same index scale (e.g. a sub-index), in slot order. */
  extra?: { name: string; values: (number | null)[] }[];
  showAverage?: boolean;
}

export function DailyIndexChart({
  items,
  referenceValue = 100,
  height = 340,
  extra = [],
  showAverage = true,
}: DailyIndexChartProps) {
  const { tokens } = useTheme();

  const option = useMemo(() => {
    const days = items.map((p) => formatDay(p.period));
    const values = items.map((p) => p.value);
    const avg = trailingMean(values, 7);
    const series: Record<string, unknown>[] = [
      {
        name: "Daily index",
        type: "line",
        data: values,
        showSymbol: false,
        symbolSize: 8,
        lineStyle: { width: 2, color: tokens.series[0] },
        itemStyle: { color: tokens.series[0], borderColor: tokens.surface, borderWidth: 2 },
        emphasis: { focus: "series" },
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: tokens.inkMuted, type: "dashed", width: 1 },
          label: {
            formatter: `Base = ${referenceValue}`,
            position: "insideEndTop",
            color: tokens.inkMuted,
            fontSize: tokens.fontSize.xs,
          },
          data: [{ yAxis: referenceValue }],
        },
      },
    ];
    if (showAverage) {
      series.push({
        name: "7-day average",
        type: "line",
        data: avg,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 2, color: tokens.series[1] },
        itemStyle: { color: tokens.series[1] },
      });
    }
    extra.forEach((e, i) => {
      const color = tokens.series[(showAverage ? 2 : 1) + i] ?? tokens.inkMuted;
      series.push({
        name: e.name,
        type: "line",
        data: e.values,
        showSymbol: false,
        lineStyle: { width: 2, color },
        itemStyle: { color },
      });
    });

    const all = [...values, ...avg, ...extra.flatMap((e) => e.values)].filter(
      (v): v is number => v !== null,
    );
    const lo = Math.floor(Math.min(referenceValue, ...all) / 5) * 5;
    const hi = Math.ceil(Math.max(referenceValue, ...all) / 5) * 5;

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
        formatter: (params: Array<{ dataIndex: number; seriesName: string; value: number | null; color: string }>) => {
          const point = items[params[0]?.dataIndex ?? 0];
          if (point === undefined) return "";
          const rows = params
            .filter((p) => p.value !== null && p.value !== undefined)
            .map(
              (p) =>
                `<div style="display:flex;justify-content:space-between;gap:16px"><span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px"></span>${p.seriesName}</span><b>${formatIndex(p.value as number)}</b></div>`,
            )
            .join("");
          return `<div style="font-weight:600;margin-bottom:4px">${formatDate(point.period)}</div>${rows}<div style="color:${tokens.inkMuted};margin-top:4px">${formatCount(point.n_quotes)} quotes · ${point.coverage_pct?.toFixed(0) ?? "—"}% matched</div>`;
        },
      },
      xAxis: {
        ...timeAxis(tokens),
        data: days,
        boundaryGap: false,
        axisLabel: { ...timeAxis(tokens).axisLabel, interval: Math.max(0, Math.floor(days.length / 8) - 1) },
      },
      yAxis: { ...valueAxis(tokens), min: lo, max: hi, name: undefined },
      series,
    };
  }, [items, referenceValue, tokens, extra, showAverage]);

  const nav = useMemo(
    () => ({
      seriesCount: 1,
      pointCount: () => items.length,
      describe: (_s: number, d: number) => {
        const point = items[d];
        return point === undefined
          ? ""
          : `${formatDate(point.period)}: index ${formatIndex(point.value)}, from ${formatCount(point.n_quotes)} quotes.`;
      },
    }),
    [items],
  );

  return (
    <EChart
      option={option}
      height={height}
      ariaLabel="Daily Airfare Price Index with its 7-day average and the base line at 100"
      nav={nav}
    />
  );
}

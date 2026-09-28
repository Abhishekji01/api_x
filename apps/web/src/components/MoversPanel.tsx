/**
 * "Notable movers" — the basket's largest changes over a stated comparison. Direction is
 * shown with an arrow and a sign, in neutral ink: a price moving is not a status. Deliberately not
 * branded "AI insights": it is the same momentum arithmetic `RouteMap` colours corridors
 * with, in plain language. No model, no generated text, nothing here that doesn't trace
 * back to `/v1/heatmap`.
 */

import type { Mover } from "../lib/movers";
import { formatDay, formatPct, formatPeriod } from "../lib/format";
import { IconTrend } from "./icons";

export function MoversPanel({
  movers,
  comparison = "vs. previous period",
  daily = false,
}: {
  movers: Mover[];
  comparison?: string;
  daily?: boolean;
}) {
  if (movers.length === 0) {
    return <p className="text-sm text-ink-2">Not enough history yet to compare periods.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {movers.map((m) => {
        const rising = m.momentumPct >= 0;
        return (
          <li key={m.routeCode} className="flex items-center gap-3 border-b border-grid pb-3 last:border-0 last:pb-0">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"
            >
              <IconTrend
                width={14}
                height={14}
                style={{ transform: rising ? undefined : "scaleY(-1)" }}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">
                <span className="tnum font-semibold">{m.routeCode}</span>{" "}
                <span className="tnum font-semibold text-ink">
                  <span aria-hidden="true">{rising ? "▲ " : "▼ "}</span>
                  {formatPct(m.momentumPct)}
                </span>
              </p>
              <p className="truncate text-xs text-ink-2">
                {comparison}, {daily ? formatDay(m.latestPeriod) : formatPeriod(m.latestPeriod)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

import { SNAPSHOT_DATE, STATIC_DEMO } from "./staticDemo";

/** Formatting helpers. All user-facing numbers and dates go through here. */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" });

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

export const formatINR = (value: number): string => inr.format(value);

/** "27 Sept" — axis ticks and compact labels for daily series. */
export function formatDay(isoDate: string): string {
  return dayFormat.format(new Date(`${isoDate}T00:00:00`));
}

/** Signed percentage change from `from` to `to`, or null when either is missing. */
export function pctChange(from: number | undefined, to: number | undefined): number | null {
  if (from === undefined || to === undefined || from === 0) return null;
  return ((to - from) / from) * 100;
}

export const formatIndex = (value: number): string => value.toFixed(1);

export function formatPct(value: number, signed = true): string {
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatPeriod(isoDate: string): string {
  return monthFormat.format(new Date(`${isoDate}T00:00:00`));
}

export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T00:00:00`));
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

/** Today's date — or, in the static demo, the day its snapshot was recorded, so every
 * page asks for data that exists instead of a date after the recording. */
export function todayISO(): string {
  if (STATIC_DEMO && SNAPSHOT_DATE !== undefined && SNAPSHOT_DATE !== "") return SNAPSHOT_DATE;
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

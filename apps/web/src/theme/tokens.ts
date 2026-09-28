/**
 * The shared theme — the only place colours, type scale and grid values live.
 *
 * Every chart and panel reads from here; no per-chart colour literals anywhere else
 * (a lint-adjacent convention enforced by review, not tooling). The categorical order
 * is a colour-vision-deficiency safety mechanism validated with the dataviz palette
 * validator in both modes — do not reorder or insert hues without re-running it.
 */

export type ThemeMode = "light" | "dark";

export interface ThemeTokens {
  mode: ThemeMode;
  /** Page background behind panels. */
  page: string;
  /** Chart / panel surface. */
  surface: string;
  surfaceRaised: string;
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  grid: string;
  axis: string;
  border: string;
  /** Categorical series colours, fixed order. Never cycled past 8. */
  series: readonly [string, string, string, string, string, string, string, string];
  /** Sequential ramp (one hue, light→dark) for magnitude. */
  sequential: readonly string[];
  /** Diverging: cool pole → neutral midpoint → warm pole, for deviation-from-zero. */
  divergingNeg: readonly string[];
  divergingMid: string;
  divergingPos: readonly string[];
  status: { good: string; warning: string; serious: string; critical: string };
  /** Emphasis colour for the headline series (categorical slot 1). */
  accent: string;
  fontFamily: string;
  fontFamilyMono: string;
  fontSize: { xs: number; sm: number; base: number; lg: number; xl: number };
}

const FONT = '"Plus Jakarta Sans", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_MONO = '"JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
const SIZES = { xs: 11, sm: 12, base: 13, lg: 16, xl: 22 } as const;

const STATUS_LIGHT = {
  good: "#10b981",
  warning: "#f59e0b",
  serious: "#f97316",
  critical: "#ef4444",
} as const;

const STATUS_DARK = {
  good: "#34d399",
  warning: "#fbbf24",
  serious: "#fb923c",
  critical: "#f87171",
} as const;

export const LIGHT: ThemeTokens = {
  mode: "light",
  page: "#f8fafc",
  surface: "#ffffff",
  surfaceRaised: "#f1f5f9",
  inkPrimary: "#0f172a",
  inkSecondary: "#475569",
  inkMuted: "#64748b",
  grid: "#e2e8f0",
  axis: "#cbd5e1",
  border: "rgba(15, 23, 42, 0.08)",
  series: [
    "#2563eb",
    "#f97316",
    "#10b981",
    "#eab308",
    "#ec4899",
    "#059669",
    "#8b5cf6",
    "#ef4444",
  ],
  sequential: ["#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"],
  divergingNeg: ["#1e3a8a", "#1d4ed8", "#3b82f6", "#93c5fd"],
  divergingMid: "#f1f5f9",
  divergingPos: ["#fca5a5", "#f87171", "#ef4444", "#991b1b"],
  status: STATUS_LIGHT,
  accent: "#2563eb",
  fontFamily: FONT,
  fontFamilyMono: FONT_MONO,
  fontSize: SIZES,
};

export const DARK: ThemeTokens = {
  mode: "dark",
  page: "#070a12",
  surface: "#0f172a",
  surfaceRaised: "#1e293b",
  inkPrimary: "#f8fafc",
  inkSecondary: "#94a3b8",
  inkMuted: "#64748b",
  grid: "#1e293b",
  axis: "#334155",
  border: "rgba(255, 255, 255, 0.1)",
  series: [
    "#38bdf8",
    "#fb923c",
    "#34d399",
    "#facc15",
    "#f472b6",
    "#4ade80",
    "#a78bfa",
    "#f87171",
  ],
  sequential: ["#0c4a6e", "#075985", "#0369a1", "#0284c7", "#38bdf8", "#7dd3fc", "#bae6fd"],
  divergingNeg: ["#bae6fd", "#7dd3fc", "#38bdf8", "#0284c7"],
  divergingMid: "#1e293b",
  divergingPos: ["#7f1d1d", "#ef4444", "#f87171", "#fca5a5"],
  status: STATUS_DARK,
  accent: "#38bdf8",
  fontFamily: FONT,
  fontFamilyMono: FONT_MONO,
  fontSize: SIZES,
};

export const tokensFor = (mode: ThemeMode): ThemeTokens => (mode === "dark" ? DARK : LIGHT);


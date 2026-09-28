import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BASE_URL } from "./api/client";
import { usePipeline } from "./api/hooks";
import { DataOriginBadge } from "./components/badges";
import { IconMoon, IconSun } from "./components/icons";
import { ApixMark } from "./components/illustrations";
import { STATIC_DEMO } from "./lib/staticDemo";
import { useTheme } from "./theme/ThemeContext";

const SCREENS = [
  { to: "/", label: "Overview", key: "1" },
  { to: "/airfare-index", label: "Daily index", key: "2" },
  { to: "/heatmap", label: "Sector heatmap", key: "3" },
  { to: "/routes", label: "Routes", key: "4" },
  { to: "/leadtime", label: "Lead time", key: "5" },
  { to: "/validation", label: "Validation", key: "6" },
  { to: "/pipeline", label: "Pipeline & ethics", key: "7" },
  { to: "/explorer", label: "Data", key: "8" },
  { to: "/reports", label: "Methodology", key: "9" },
  { to: "/settings", label: "Audit trail", key: "" },
  { to: "/api-access", label: "API", key: "" },
] as const;

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const pipeline = usePipeline();
  const { mode, toggleMode } = useTheme();
  const origin = pipeline.data?.data_origin;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target !== null && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const screen = SCREENS.find((s) => s.key !== "" && s.key === event.key);
      if (screen !== undefined) navigate(screen.to);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-page text-ink antialiased selection:bg-accent/20 selection:text-accent">
      <a
        href="#main"
        className="visually-hidden focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-xl"
      >
        Skip to content
      </a>

      {/* Top Govt Context Strip */}
      <div className="bg-navy text-on-navy-muted border-b border-navy-2/60">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-xs sm:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 live-dot" />
            <span className="font-medium text-on-navy">
              Ministry of Statistics &amp; Programme Implementation (MoSPI)
            </span>
            <span className="opacity-40">·</span>
            <span>Smart India Hackathon 2026 (PS 26056)</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold text-on-navy">
            <span>Team Vyomastra</span>
          </div>
        </div>
      </div>

      {/* Sticky Blurred Header */}
      <header className="sticky top-0 z-40 border-b border-edge/80 bg-surface/90 backdrop-blur-md transition-colors">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <NavLink to="/" className="flex min-w-0 items-center gap-3.5 group">
            <ApixMark className="h-10 w-10 shrink-0 transition-transform group-hover:scale-105" />
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-ink font-sans">
                  APIx
                </h1>
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent-ink tracking-wide uppercase">
                  Airfare Price Index
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-ink-2">
                Real-time route-level airfare index for India (augmenting CPI)
              </p>
            </div>
          </NavLink>

          <div className="flex flex-wrap items-center gap-3">
            {origin !== undefined && <DataOriginBadge origin={origin} />}

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleMode}
              aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-edge/80 bg-surface-raised text-ink-2 transition-colors hover:border-accent hover:text-accent-ink"
            >
              {mode === "dark" ? <IconSun className="h-4 w-4" /> : <IconMoon className="h-4 w-4" />}
            </button>

            {!STATIC_DEMO && (
              <a
                href={`${BASE_URL}/docs`}
                className="flex items-center gap-1.5 rounded-xl border border-edge/80 bg-surface-raised px-3.5 py-1.5 text-xs font-semibold text-ink-2 transition-all hover:border-accent hover:text-accent-ink hover:shadow-sm"
              >
                API docs
              </a>
            )}
          </div>
        </div>

        {/* Section Tabs */}
        <div className="border-t border-edge/40 bg-surface/40">
          <nav
            aria-label="Sections"
            className="mx-auto flex max-w-[1440px] items-center gap-1.5 overflow-x-auto px-3 py-1.5 sm:px-6 no-scrollbar"
          >
            {SCREENS.map((item) => {
              const isActive =
                item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  title={item.key !== "" ? `Keyboard shortcut: ${item.key}` : undefined}
                  className={`shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-accent text-white shadow-sm font-bold"
                      : "text-ink-2 hover:bg-surface-raised hover:text-ink"
                  }`}
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      {(origin === "SYNTHETIC" || origin === "MIXED") && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 backdrop-blur-sm">
          <p className="mx-auto max-w-[1440px] px-4 py-2.5 text-xs text-ink sm:px-6">
            <strong className="font-semibold text-amber-600 dark:text-amber-400">
              Demonstration data:
            </strong>{" "}
            {origin === "SYNTHETIC"
              ? "Every fare on this site comes from APIx's labelled synthetic generator."
              : "Some fares come from APIx's synthetic generator."}{" "}
            The pipeline, cleaning, and index math are real production code.{" "}
            <NavLink to="/pipeline" className="font-semibold text-accent underline underline-offset-2">
              Learn how collection works →
            </NavLink>
          </p>
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="mt-auto border-t border-edge/80 bg-surface py-8">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 text-xs text-ink-2 sm:px-6">
          <div className="flex items-center gap-3">
            <ApixMark className="h-6 w-6" />
            <span className="font-bold text-ink text-sm">APIx</span>
            <span className="text-ink-muted">·</span>
            <span>Real-time Airfare Price Index for India · Team Vyomastra</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-medium">
            <NavLink to="/reports" className="transition-colors hover:text-accent">
              Methodology
            </NavLink>
            <NavLink to="/validation" className="transition-colors hover:text-accent">
              Validation
            </NavLink>
            <NavLink to="/pipeline" className="transition-colors hover:text-accent">
              Compliance
            </NavLink>
            <NavLink to="/api-access" className="transition-colors hover:text-accent">
              API for NSO &amp; RBI
            </NavLink>
          </div>
          <p className="text-ink-muted text-[11px]">Not an official statistical release.</p>
        </div>
      </footer>
    </div>
  );
}


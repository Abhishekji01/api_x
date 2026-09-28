/**
 * Dashboard shell — an official-statistics data portal: a slim context strip, a white
 * masthead with the index's name and the honest state of the data behind it, a single
 * row of section tabs (keyboard shortcuts 1-9), and a footer.
 *
 * The data-origin badge and banner come from `/v1/pipeline` — when every quote in the
 * database is from the labelled synthetic generator, every page says so. Nothing in the
 * chrome is decorative "live" theatre: no invented latency, no pulsing LIVE badge.
 */

import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BASE_URL } from "./api/client";
import { usePipeline } from "./api/hooks";
import { DataOriginBadge } from "./components/badges";
import { ApixMark } from "./components/illustrations";
import { STATIC_DEMO } from "./lib/staticDemo";

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
    <div className="flex min-h-screen flex-col bg-page text-ink antialiased">
      <a
        href="#main"
        className="visually-hidden focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Context strip */}
      <div className="bg-navy text-on-navy-muted">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 text-[11px] sm:px-6">
          <span>
            Prototype for the Ministry of Statistics &amp; Programme Implementation (MoSPI) ·
            Smart India Hackathon 2026 · Problem statement 26056
          </span>
          <span className="hidden sm:inline">Team Vyom</span>
        </div>
      </div>

      {/* Masthead */}
      <header className="border-b border-edge bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <NavLink to="/" className="flex min-w-0 items-center gap-3">
            <ApixMark className="h-10 w-10 shrink-0" />
            <div className="min-w-0 leading-tight">
              <p className="text-lg font-bold tracking-tight text-ink">
                APIx <span className="font-medium text-ink-2">· Airfare Price Index for India</span>
              </p>
              <p className="text-xs text-ink-2">
                A daily, route-level index of domestic airfares, built to augment the CPI
              </p>
            </div>
          </NavLink>
          <div className="flex flex-wrap items-center gap-2">
            {origin !== undefined && <DataOriginBadge origin={origin} />}
            {!STATIC_DEMO && (
              <a
                href={`${BASE_URL}/docs`}
                className="rounded-md border border-edge px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-accent hover:text-accent-ink"
              >
                API docs
              </a>
            )}
          </div>
        </div>

        {/* Section tabs */}
        <nav
          aria-label="Sections"
          className="mx-auto flex max-w-[1400px] items-center gap-1 overflow-x-auto px-2 sm:px-4"
        >
          {SCREENS.map((item) => {
            const isActive =
              item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                title={item.key !== "" ? `Shortcut: ${item.key}` : undefined}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  isActive
                    ? "border-accent text-accent-ink"
                    : "border-transparent text-ink-2 hover:border-edge hover:text-ink"
                }`}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </header>

      {(origin === "SYNTHETIC" || origin === "MIXED") && (
        <div className="border-b border-warning-ink/20 bg-warning-soft">
          <p className="mx-auto max-w-[1400px] px-4 py-2 text-xs text-ink sm:px-6">
            <strong className="font-semibold text-warning-ink">Demonstration data.</strong>{" "}
            {origin === "SYNTHETIC"
              ? "Every fare on this site comes from APIx's labelled synthetic generator, not from airline or OTA websites."
              : "Some fares on this site come from APIx's labelled synthetic generator."}{" "}
            The pipeline, cleaning and index maths are the real production code; live collection
            starts source by source once each site's terms-of-service review is recorded.{" "}
            <NavLink to="/pipeline" className="font-semibold text-accent-ink underline underline-offset-2">
              How collection works
            </NavLink>
          </p>
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-edge bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-ink-2 sm:px-6">
          <div className="flex items-center gap-2">
            <ApixMark className="h-5 w-5" />
            <span className="font-semibold text-ink">APIx</span>
            <span>Real-time Airfare Price Index for India · Team Vyom</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <NavLink to="/reports" className="hover:text-accent-ink">
              Methodology
            </NavLink>
            <NavLink to="/validation" className="hover:text-accent-ink">
              Validation
            </NavLink>
            <NavLink to="/pipeline" className="hover:text-accent-ink">
              Compliance
            </NavLink>
            <NavLink to="/api-access" className="hover:text-accent-ink">
              API for NSO &amp; RBI
            </NavLink>
          </div>
          <p className="text-ink-muted">Not an official statistical release.</p>
        </div>
      </footer>
    </div>
  );
}

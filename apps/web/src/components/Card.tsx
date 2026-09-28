/** The one panel shape every non-chart block on a page uses. */

import { useId } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface CardProps {
  title: string;
  subtitle?: string;
  /** An in-app link shown top-right, e.g. to the full page for this summary. */
  more?: { to: string; label: string };
  className?: string;
  children: ReactNode;
}

export function Card({ title, subtitle, more, className = "", children }: CardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-xl border border-edge bg-surface p-5 shadow-card ${className}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[15px] font-semibold text-ink">
            {title}
          </h2>
          {subtitle !== undefined && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
        </div>
        {more !== undefined && (
          <Link
            to={more.to}
            className="shrink-0 text-xs font-semibold text-accent-ink hover:underline"
          >
            {more.label} →
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/** A label/value pair in a definition list, for "at a glance" facts. */
export function Fact({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-grid py-2 last:border-0">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="text-right">
        <span className="tnum text-sm font-semibold text-ink">{value}</span>
        {note !== undefined && <span className="block text-[11px] text-ink-muted">{note}</span>}
      </dd>
    </div>
  );
}

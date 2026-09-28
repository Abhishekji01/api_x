/**
 * Pipeline & ethics — how a fare gets from a web page into the index, and the rules
 * that govern every request. All of it from `/v1/pipeline`: counts, schedule, the
 * compliance position of every source, and the PolicyEngine's decisions.
 */

import type { PipelineSource } from "../api/client";
import { usePipeline } from "../api/hooks";
import { Card, Fact } from "../components/Card";
import { PipelineArt } from "../components/illustrations";
import { PageHeader } from "../components/PageHeader";
import { formatCount, formatDate } from "../lib/format";

const TYPE_LABEL: Record<string, string> = {
  AIRLINE: "Airline",
  OTA: "Travel aggregator",
  METASEARCH: "Metasearch",
  GDS: "Licensed feed",
  OFFICIAL: "Official statistics",
  SYNTHETIC: "Demo generator",
};

function sourceState(s: PipelineSource): { label: string; cls: string; icon: string } {
  if (s.source_type === "SYNTHETIC")
    return { label: "Demo data", cls: "bg-warning-soft text-warning-ink", icon: "◐" };
  if (s.enabled && s.tos_verdict === "PERMITTED")
    return { label: "Cleared to collect", cls: "bg-good-soft text-good-ink", icon: "✓" };
  if (s.tos_verdict === "PROHIBITED")
    return { label: "Terms prohibit", cls: "bg-critical-soft text-critical-ink", icon: "✕" };
  return { label: "Awaiting terms review", cls: "bg-raised text-ink-2 border border-edge", icon: "○" };
}

const STEPS = [
  {
    title: "Schedule",
    body: "Prefect runs a sweep four times a day, across every basket route and booking window, with a random start offset so no site sees a clockwork pattern.",
  },
  {
    title: "Permission",
    body: "Before any request, the PolicyEngine checks the source is cleared, reads robots.txt, and takes a token from the per-source rate limit.",
  },
  {
    title: "Collection",
    body: "Scrapy for static pages, Playwright for JavaScript-rendered ones. The raw response is stored and every quote is written append-only.",
  },
  {
    title: "Cleaning",
    body: "Duplicates removed, fares split into base, taxes, UDF and convenience fee, outliers flagged with their rule, sold-out cells recorded as such.",
  },
  {
    title: "Index",
    body: "Matched flights compared day to day per route and window, then combined with booking-profile and DGCA passenger weights.",
  },
];

export default function Pipeline() {
  const pipeline = usePipeline();
  const data = pipeline.data;
  const sources = data?.sources ?? [];
  const real = sources.filter((s) => s.source_type !== "SYNTHETIC" && s.domain !== "localhost");
  const collectors = real.filter((s) => ["AIRLINE", "OTA", "METASEARCH", "GDS"].includes(s.source_type));
  const official = real.filter((s) => s.source_type === "OFFICIAL");
  const demo = sources.filter((s) => s.source_type === "SYNTHETIC");
  const decisions = Object.entries(data?.policy_decisions ?? {});

  const table = (rows: PipelineSource[]) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-xs text-ink-2">
            <th className="py-2 pr-3 font-semibold">Source</th>
            <th className="py-2 pr-3 font-semibold">Type</th>
            <th className="py-2 pr-3 font-semibold">Status</th>
            <th className="py-2 pr-3 font-semibold">robots.txt</th>
            <th className="py-2 pr-3 text-right font-semibold">Delay</th>
            <th className="py-2 pr-3 text-right font-semibold">Max / hour</th>
            <th className="py-2 text-right font-semibold">Quotes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const st = sourceState(s);
            return (
              <tr key={s.code} className="border-b border-grid last:border-0">
                <td className="py-2.5 pr-3">
                  <span className="font-medium text-ink">{s.display_name}</span>
                  <span className="block text-xs text-ink-muted">{s.domain}</span>
                </td>
                <td className="py-2.5 pr-3 text-ink-2">{TYPE_LABEL[s.source_type] ?? s.source_type}</td>
                <td className="py-2.5 pr-3">
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                    <span aria-hidden="true">{st.icon}</span>
                    {st.label}
                  </span>
                  {s.tos_reviewed_at !== null && s.tos_reviewed_at !== undefined && (
                    <span className="block text-[11px] text-ink-muted">reviewed {formatDate(s.tos_reviewed_at)}</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-xs text-ink-2">{s.robots_url === null ? "—" : "obeyed"}</td>
                <td className="tnum py-2.5 pr-3 text-right text-ink-2">
                  {s.crawl_delay_s === null ? "—" : `${s.crawl_delay_s.toFixed(0)} s`}
                </td>
                <td className="tnum py-2.5 pr-3 text-right text-ink-2">{s.max_requests_per_hour ?? "—"}</td>
                <td className="tnum py-2.5 text-right text-ink">{formatCount(s.quotes_total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pipeline & ethics"
        subtitle="How a fare gets from a web page into the index — and the rules every request obeys. Compliance is enforced in code: a request the PolicyEngine does not clear never leaves the machine."
        art={<PipelineArt />}
      />

      {/* Stage counts */}
      <section aria-label="Pipeline stages" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {(data?.stages ?? []).map((s) => (
          <div key={s.key} className="rounded-xl border border-edge bg-surface p-4 shadow-card">
            <p className="text-xs text-ink-2">{s.label}</p>
            <p className="tnum mt-1 text-2xl font-bold text-ink">{formatCount(s.count)}</p>
            <p className="mt-1 text-[11px] leading-snug text-ink-muted">{s.note}</p>
          </div>
        ))}
        {pipeline.isLoading && <p className="text-sm text-ink-2">Loading…</p>}
      </section>

      {/* Flow */}
      <Card title="Five steps, every day">
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative rounded-lg border border-grid bg-raised p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs font-bold text-on-navy">
                {i + 1}
              </span>
              <p className="mt-3 text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">{step.body}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Collection plan">
          <dl>
            <Fact label="City-pairs" value={data?.routes_in_basket ?? "…"} note="Chosen and weighted from DGCA traffic" />
            <Fact label="Booking windows" value={data?.advance_windows.length ?? "…"} note={data?.advance_windows.join(" · ")} />
            <Fact label="Sweeps per day (IST)" value={data?.sweep_times_local.length ?? "…"} note={data?.sweep_times_local.join(" · ")} />
            <Fact label="Days with data" value={data?.days_collected ?? "…"} />
            <Fact
              label="First / latest day"
              value={
                data?.first_query_date && data.last_query_date
                  ? `${formatDate(data.first_query_date)} – ${formatDate(data.last_query_date)}`
                  : "…"
              }
            />
          </dl>
        </Card>
        <Card title="Safeguards, enforced in code" className="lg:col-span-2">
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {(data?.safeguards ?? []).map((g) => (
              <li key={g} className="flex gap-2 text-sm text-ink-2">
                <span aria-hidden="true" className="mt-0.5 text-good-ink">✓</span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-grid pt-3">
            <p className="text-xs font-semibold text-ink">PolicyEngine decisions logged</p>
            {decisions.length === 0 ? (
              <p className="mt-1 text-xs text-ink-2">
                None yet — no live source has been cleared, so no request has been attempted. Every future
                allow or deny is written here with its reason.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {decisions.map(([k, v]) => (
                  <span key={k} className="rounded-full bg-raised px-2.5 py-1 text-xs text-ink">
                    {k.replace(/_/g, " ").toLowerCase()}: <strong className="tnum">{formatCount(v)}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card
        title="Airline and travel-aggregator sources"
        subtitle="Each starts disabled. A team member reads the site's terms, records the verdict and date, and only then can the collector run — reviews expire after 180 days."
      >
        {table(collectors)}
      </Card>

      <div className="flex flex-col gap-5">
        <Card title="Official data sources" subtitle="Benchmarks and weights: DGCA traffic and fares, MoSPI CPI, ATF prices.">
          {table(official)}
        </Card>
        <Card
          title="Demonstration data"
          subtitle="The labelled synthetic generator behind this demo. Its rows are tagged SYNTHETIC on every quote and can never be mistaken for collected data."
        >
          {table(demo)}
        </Card>
      </div>
    </div>
  );
}

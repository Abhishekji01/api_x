/**
 * Screen — API Access.
 *
 * There is no consumer API-key system in this build — PolicyEngine governs outbound
 * collection requests, not inbound API auth — so this screen never shows a fabricated
 * key. Endpoints listed here are the real routers mounted in `apps/api/src/apix_api/main.py`,
 * against the real `BASE_URL`.
 */

import { useState } from "react";
import { BASE_URL } from "../api/client";
import { STATIC_DEMO } from "../lib/staticDemo";
import { IconCode, IconCopy } from "../components/icons";

export default function ApiAccessScreen() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const ENDPOINTS = [
    {
      id: "daily",
      method: "GET",
      path: "/v1/index?series=APIX.ALL.D&freq=D",
      desc: "The daily national Airfare Price Index, each value with its quote count and matched coverage.",
      access: "Open",
    },
    {
      id: "index",
      method: "GET",
      path: "/v1/index?series=APIX.ALL.M&freq=M",
      desc: "The monthly publication, for the CPI, with vintages and revisions kept.",
      access: "Open",
    },
    {
      id: "validation",
      method: "GET",
      path: "/v1/validation",
      desc: "The back-test: APIx against MoSPI's CPI air fare, DGCA average fares and a unit-value mean.",
      access: "Open",
    },
    {
      id: "heatmap",
      method: "GET",
      path: "/v1/heatmap?freq=D",
      desc: "Route x day grid behind the sector heatmap (freq=M for months).",
      access: "Open",
    },
    {
      id: "leadtime",
      method: "GET",
      path: "/v1/leadtime/DEL-BOM",
      desc: "Mean fare by advance-purchase window for one route.",
      access: "Open",
    },
    {
      id: "pipeline",
      method: "GET",
      path: "/v1/pipeline",
      desc: "Collection and cleaning counts, and the compliance position of every source.",
      access: "Open",
    },
    {
      id: "sdmx",
      method: "GET",
      path: "/v1/sdmx/data/IN_APIX,DF_AIRFARE_INDEX,1.0.0/M.DEL-BOM.ALL.ALL",
      desc: "SDMX-JSON 2.0 data message — the format statistical offices and central banks exchange.",
      access: "Open",
    },
    {
      id: "quotes",
      method: "GET",
      path: "/v1/quotes?route=DEL-BOM&period=2026-09-01",
      desc: "The cleaned quotes behind a route and period, with each row's outlier/imputation treatment.",
      access: "Researcher key",
    },
    {
      id: "provenance",
      method: "GET",
      path: "/v1/provenance/{quote_id}",
      desc: "Trace one quote to its source, timestamp, legal basis and every index value it fed.",
      access: "Researcher key",
    },
    {
      id: "export",
      method: "GET",
      path: "/v1/export.csv?series=APIX.ALL.D",
      desc: "CSV for R, Stata or Python, with provenance columns.",
      access: "Researcher key",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="rounded-xl border border-edge bg-surface p-6 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-accent-ink">
            <IconCode width={20} height={20} />
            <span className="text-xs font-bold uppercase tracking-wider">Developer &amp; Consumer Integration</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink">
            APIx Programmatic Access &amp; SDMX Feeds
          </h2>
          <p className="mt-1 text-xs text-ink-2 max-w-2xl">
            Built for the NSO and the RBI to consume directly: OpenAPI 3.1 and SDMX-JSON 2.0. Published
            figures are open to everyone; individual quotes, draft figures and bulk export need a
            researcher or official key in the <code className="font-mono">X-API-Key</code> header.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={STATIC_DEMO ? `${import.meta.env.BASE_URL}openapi.json` : `${BASE_URL}/docs`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-accent px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:brightness-110 transition-colors"
          >
            {STATIC_DEMO ? "OpenAPI 3.1 specification ↗" : "Interactive API docs ↗"}
          </a>
        </div>
      </div>

      {/* Endpoints List */}
      <div className="flex flex-col gap-4">
        {ENDPOINTS.map((ep) => (
          <div
            key={ep.id}
            className="rounded-xl border border-edge bg-surface p-5 shadow-card flex flex-col gap-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    ep.access === "Open" ? "bg-good-soft text-good-ink" : "bg-raised text-ink-2 border border-edge"
                  }`}
                >
                  {ep.access}
                </span>
                {ep.desc}
              </span>
              <button
                type="button"
                onClick={() => copy(ep.id, `${BASE_URL}${ep.path}`)}
                className="flex items-center gap-1 text-xs text-accent-ink hover:underline"
              >
                <IconCopy width={13} height={13} />
                {copied === ep.id ? "Copied" : "Copy URL"}
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-edge bg-raised px-4 py-2.5 font-mono text-xs">
              <span className="mr-2 font-bold text-accent-ink">{ep.method}</span>
              <span className="whitespace-nowrap text-ink">{STATIC_DEMO ? "" : BASE_URL}{ep.path}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

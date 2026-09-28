#!/usr/bin/env node
/**
 * Record the API responses the dashboard reads into demo-snapshot/, so the static
 * demo build (VITE_APIX_STATIC=1) runs on any static host with no backend.
 *
 *   node scripts/harvest-snapshot.mjs --api http://localhost:8000 [--key <researcher key>]
 *
 * Responses are grouped into one "pack" per API area (index, routes, leadtime, ...), keyed
 * exactly as src/lib/staticDemo.ts's snapshotKey() keys a request — keep the two in sync.
 * Nothing is computed here: every value is a verbatim API response. Key-protected
 * endpoints (quotes, provenance) are recorded only when --key is given, and only for a
 * bounded set of routes; anything not recorded answers "not in the snapshot" in the demo.
 */

import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const API = (args.api ?? "http://localhost:8000").replace(/\/$/, "");
const KEY = args.key;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "demo-snapshot");
const PROVENANCE_ROUTES = Number(args["provenance-routes"] ?? 5);

/** Mirror of snapshotKey() in src/lib/staticDemo.ts. */
function snapshotKey(url) {
  const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const query = params.map(([k, v]) => `${k}=${v}`).join("&");
  const raw = `${url.pathname}${query === "" ? "" : `?${query}`}`;
  return raw.replace(/^\//, "").replace(/[^A-Za-z0-9._-]+/g, "_");
}
function packOf(url) {
  return url.pathname.split("/")[2] ?? "misc";
}

const packs = new Map();
let count = 0;
let missing = 0;

async function get(pathAndQuery, { auth = false, optional = false } = {}) {
  const url = new URL(`${API}${pathAndQuery}`);
  const headers = auth && KEY ? { "X-API-Key": KEY } : {};
  let res = await fetch(url, { headers });
  // The API rate-limits every caller (apix_api.middleware); honour its Retry-After.
  for (let attempt = 0; res.status === 429 && attempt < 20; attempt += 1) {
    const wait = Number(res.headers.get("retry-after") ?? "1");
    await new Promise((r) => setTimeout(r, Math.max(0.25, wait) * 1000));
    res = await fetch(url, { headers });
  }
  if (!res.ok) {
    if (!optional) console.warn(`  ! ${res.status} ${pathAndQuery}`);
    missing += 1;
    return null;
  }
  const body = await res.json();
  const pack = packOf(url);
  if (!packs.has(pack)) packs.set(pack, {});
  packs.get(pack)[snapshotKey(url)] = body;
  count += 1;
  return body;
}

/** Follow cursor pages exactly as the dashboard does, recording each page. */
async function getAllPages(path, query) {
  const items = [];
  let cursor;
  for (let page = 0; page < 50; page += 1) {
    const q = new URLSearchParams({ ...query, ...(cursor ? { cursor } : {}) });
    const body = await get(`${path}?${q}`);
    if (body === null) break;
    items.push(...body.items);
    if (!body.pagination.has_more || !body.pagination.next_cursor) break;
    cursor = body.pagination.next_cursor;
  }
  return items;
}

function shiftDays(iso, delta) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

console.log(`Harvesting ${API} ${KEY ? "(with researcher key)" : "(public endpoints only)"}`);

const basket = await get("/v1/metadata/basket");
await get("/v1/metadata/method");
const carriers = await get("/v1/metadata/carriers");
await get("/v1/routes");
await get("/v1/pipeline");
await get("/v1/validation?series=APIX.ALL.D");

const daily = await get("/v1/index?series=APIX.ALL.D&freq=D&limit=1000");
const monthly = await get("/v1/index?series=APIX.ALL.M&freq=M&limit=1000");
for (const code of ["AP04_07", "AP15_21", "AP31_60"]) {
  await get(`/v1/index?series=APIX.WINDOW.${code}.D&freq=D&limit=1000`);
}
for (const code of ["LCC", "FSC"]) {
  await get(`/v1/index?series=APIX.CARRIERTYPE.${code}.D&freq=D&limit=1000`);
}

const firstDay = daily.items[0].period;
const lastDay = daily.items.at(-1).period;

await get("/v1/heatmap");
await getAllPages("/v1/heatmap", { freq: "D", limit: "1000", from: firstDay });
await getAllPages("/v1/heatmap", { freq: "D", limit: "1000", from: shiftDays(lastDay, -20) });

const months = monthly.items.map((p) => p.period);
await get("/v1/index/revisions?series=APIX.ALL.M");
const contributorsByMonth = {};
for (const period of months) {
  contributorsByMonth[period] = await get(
    `/v1/index/contributors?series=APIX.ALL.M&period=${period}`,
  );
  await get(`/v1/index/vintage?series=APIX.ALL.M&period=${period}&as_of=${lastDay}`, {
    optional: true,
  });
}
// The Audit screen opens on this period before anything is clicked.
await get(`/v1/index/vintage?series=APIX.ALL.M&period=2026-08-01&as_of=${lastDay}`, {
  optional: true,
});

const routeCodes = basket.routes.map((r) => r.code);
const busiest = [...basket.routes]
  .sort((a, b) => (b.dgca_pax_share ?? 0) - (a.dgca_pax_share ?? 0))
  .map((r) => r.code);
const carrierCodes = carriers.carriers.map((c) => c.iata);
const windowDays = basket.advance_windows.map((w) => Math.floor((w.min_days + w.max_days) / 2));

for (const code of routeCodes) {
  for (const d of windowDays) await get(`/v1/routes/${code}/series?advance_days=${d}`, { optional: true });
  for (const c of carrierCodes) await get(`/v1/routes/${code}/series?carrier=${c}`, { optional: true });
  await get(`/v1/leadtime/${code}`, { optional: true });
  for (const c of carrierCodes) await get(`/v1/leadtime/${code}?carrier=${c}`, { optional: true });
}

if (KEY) {
  const quoteMonths = [...new Set([...months, `${lastDay.slice(0, 7)}-01`])];
  for (const code of routeCodes) {
    for (const period of quoteMonths) {
      const body = await get(`/v1/quotes?period=${period}&route=${code}`, { auth: true, optional: true });
      if (body !== null && busiest.indexOf(code) < PROVENANCE_ROUTES) {
        for (const q of body.items.filter((q) => !q.is_imputed)) {
          await get(`/v1/provenance/${q.quote_id}`, { auth: true, optional: true });
        }
      }
    }
  }
}

if (KEY) {
  // The Methodology page opens on the method in force (an empty override set); record
  // that one preview. Any other override set needs the live API in the demo.
  const res = await fetch(`${API}/v1/method/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: "{}",
  });
  if (res.ok) {
    if (!packs.has("method")) packs.set("method", {});
    packs.get("method")["POST_v1_method_preview_{}"] = await res.json();
    count += 1;
  }
}

await mkdir(OUT, { recursive: true });
let bytes = 0;
for (const [pack, entries] of packs) {
  const text = JSON.stringify(entries);
  bytes += text.length;
  await writeFile(join(OUT, `${pack}.json`), text);
}
const manifest = {
  generated_at: new Date().toISOString(),
  api: API,
  snapshot_date: lastDay,
  first_day: firstDay,
  packs: [...packs.keys()].sort(),
  responses: count,
  note: "Verbatim API responses recorded for the static demo. Not an official statistical release.",
};
await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
await copyFile(join(ROOT, "..", "..", "docs", "openapi.json"), join(OUT, "openapi.json"));
console.log(
  `Recorded ${count} responses in ${packs.size} packs (${(bytes / 1e6).toFixed(1)} MB); ${missing} not available. Snapshot date ${lastDay}.`,
);

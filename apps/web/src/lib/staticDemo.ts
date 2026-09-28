/**
 * Static demo mode: the dashboard served from a recorded snapshot of API responses
 * (`public/snapshot/`, written by `scripts/harvest-snapshot.mjs`), so it can be hosted
 * on any static host with no backend. Every page still reads the same `/v1/*` shapes;
 * only the transport changes. Anything not in the snapshot answers with an honest
 * RFC 9457 problem, never an invented value.
 */

export const STATIC_DEMO: boolean = import.meta.env.VITE_APIX_STATIC !== "0";

/** Snapshot key for one GET request: API path + sorted query, made filesystem-safe.
 * scripts/harvest-snapshot.mjs mirrors this exactly — change both together. */
export function snapshotKey(path: string, search: URLSearchParams): string {
  const params = [...search.entries()].sort(([a], [b]) => a.localeCompare(b));
  const query = params.map(([k, v]) => `${k}=${v}`).join("&");
  const raw = `${path}${query === "" ? "" : `?${query}`}`;
  return raw.replace(/^\//, "").replace(/[^A-Za-z0-9._-]+/g, "_");
}

/** The day the snapshot was recorded; the app treats it as "today" in demo mode. */
export const SNAPSHOT_DATE: string | undefined = import.meta.env.VITE_APIX_SNAPSHOT_DATE;

function problem(status: number, title: string, detail: string): Response {
  return new Response(
    JSON.stringify({ type: "about:blank", title, status, detail, instance: null, trace_id: null }),
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

const packCache = new Map<string, Promise<Record<string, unknown> | null>>();

function loadPack(realFetch: typeof fetch, name: string): Promise<Record<string, unknown> | null> {
  let pending = packCache.get(name);
  if (pending === undefined) {
    pending = realFetch(`${import.meta.env.BASE_URL}snapshot/${name}.json`)
      .then(async (r) => (r.ok ? ((await r.json()) as Record<string, unknown>) : null))
      .catch(() => null);
    packCache.set(name, pending);
  }
  return pending;
}

/** Route every API request to the recorded snapshot instead of the network. */
export function installStaticFetch(apiBase: string): void {
  const realFetch = window.fetch.bind(window);
  const base = new URL(apiBase, window.location.href);
  const basePath = base.pathname.replace(/\/$/, "");
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== base.origin || !url.pathname.startsWith(`${basePath}/v1/`)) {
      return realFetch(input, init);
    }
    const path = url.pathname.slice(basePath.length);
    if (request.method === "POST" && path === "/v1/method/preview") {
      const recorded = (await loadPack(realFetch, "method"))?.["POST_v1_method_preview_{}"] as
        | { settings?: Record<string, unknown> }
        | undefined;
      let overrides: Record<string, unknown> = {};
      try {
        overrides = JSON.parse((await request.clone().text()) || "{}") as Record<string, unknown>;
      } catch {
        overrides = { invalid: true };
      }
      // Serve the recorded preview when the controls ask for the method in force.
      const baseline = recorded?.settings ?? {};
      const isBaseline = Object.entries(overrides).every(
        ([k, v]) => v === null || v === undefined || baseline[k] === v,
      );
      if (recorded !== undefined && isBaseline) {
        return new Response(JSON.stringify(recorded), {
          status: 200,
          headers: { "Content-Type": "application/json", "X-APIx-Data-Status": "PROVISIONAL" },
        });
      }
    }
    if (request.method !== "GET") {
      return problem(
        503,
        "Needs the live API",
        "This site is a recorded snapshot of APIx. What-if recomputation with draft method settings runs only against the live API.",
      );
    }
    const pack = await loadPack(realFetch, path.split("/")[2] ?? "misc");
    const body = pack?.[snapshotKey(path, url.searchParams)];
    if (body === undefined) {
      return problem(
        404,
        "Not in this snapshot",
        "This demo is a recorded snapshot of the API, and this particular view was not recorded. Every published figure is; for anything else, run APIx locally.",
      );
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-APIx-Data-Status": "PUBLISHED" },
    });
  };
}

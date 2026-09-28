/**
 * Typed client for the APIx API, built on the generated OpenAPI types.
 *
 * `schema.d.ts` is generated from `docs/openapi.json` (`npm run generate:api`); nothing
 * in here declares a response shape by hand. Errors are RFC 9457 problem documents and
 * surface as `ApiProblem`, so every panel can show the server's own explanation.
 */

import createClient from "openapi-fetch";
import { STATIC_DEMO, installStaticFetch } from "../lib/staticDemo";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];

export type IndexPoint = Schemas["IndexPoint"];
export type VintageValue = Schemas["VintageValue"];
export type RouteSummary = Schemas["RouteSummary"];
export type RouteSeriesPoint = Schemas["RouteSeriesPoint"];
export type LeadTimeResponse = Schemas["LeadTimeResponse"];
export type LeadTimeBucket = Schemas["LeadTimeBucket"];
export type HeatmapCell = Schemas["HeatmapCell"];
export type CoverageResponse = Schemas["CoverageResponse"];
export type SourceCoverage = Schemas["SourceCoverage"];
export type MethodMetadata = Schemas["MethodMetadata"];
export type BasketMetadata = Schemas["BasketMetadata"];
export type CarrierOut = Schemas["CarrierOut"];
export type MethodOverrides = Schemas["MethodOverrides"];
export type MethodPreviewResponse = Schemas["MethodPreviewResponse"];
export type ProvenanceResponse = Schemas["ProvenanceResponse"];
export type QuoteSummary = Schemas["QuoteSummary"];
export type RouteContribution = Schemas["RouteContribution"];
export type RevisionEntry = Schemas["RevisionEntry"];
export type NowcastPoint = Schemas["NowcastPoint"];
export type DecompositionResponse = Schemas["DecompositionResponse"];
export type ResponseMeta = Schemas["ResponseMeta"];
export type ValidationResponse = Schemas["ValidationResponse"];
export type Benchmark = Schemas["Benchmark"];
export type SeriesPoint = Schemas["SeriesPoint"];
export type ValidationScore = Schemas["ValidationScore"];
export type PipelineResponse = Schemas["PipelineResponse"];
export type PipelineSource = Schemas["PipelineSource"];

/** The headline series code and the official CPI comparison series it is drawn against. */
export const HEADLINE_SERIES = "APIX.ALL.M";
export const CPI_SERIES = "CPI.TRANSPORT.AIRFARE.M";
/** The daily headline — what the problem statement asks the dashboard to show. */
export const DAILY_HEADLINE = "APIX.ALL.D";

declare global {
  interface Window {
    /** Optional runtime override, from /config.js (see infra/docker/web.Dockerfile). */
    __APIX_CONFIG__?: { apiUrl?: string };
  }
}

/** A virtual origin the static-demo transport answers for (lib/staticDemo.ts). */
const STATIC_API_BASE = `${window.location.origin}/__apix_snapshot_api`;

/**
 * Where the API lives, in order: static-demo snapshot; a runtime /config.js override;
 * the build-time VITE_APIX_API_URL; local development.
 */
export const BASE_URL: string = STATIC_DEMO
  ? STATIC_API_BASE
  : (window.__APIX_CONFIG__?.apiUrl ??
    (import.meta.env.VITE_APIX_API_URL as string | undefined) ??
    (import.meta.env.DEV ? "http://localhost:8000" : ""));

if (STATIC_DEMO) installStaticFetch(BASE_URL);

/** An RFC 9457 problem document, thrown for any non-2xx response. */
export class ApiProblem extends Error {
  constructor(
    readonly type: string,
    readonly title: string,
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(detail ?? title);
    this.name = "ApiProblem";
  }
}

export const api = createClient<paths>({ baseUrl: BASE_URL });

/**
 * Local-dev-only: attaches an API key from the environment so authenticated endpoints
 * (method preview, provenance, quotes, exports) work against a local backend. Never set
 * in a real deployment — `VITE_APIX_API_KEY` is not meant to carry a production key past
 * a developer's own `.env`, which is git-ignored.
 */
const DEV_API_KEY = import.meta.env.VITE_APIX_API_KEY as string | undefined;
if (DEV_API_KEY !== undefined && DEV_API_KEY !== "") {
  api.use({
    onRequest({ request }) {
      request.headers.set("X-API-Key", DEV_API_KEY);
      return request;
    },
  });
}

interface FetchOutcome<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Unwrap an openapi-fetch result, converting a problem document into a thrown error. */
export function unwrap<T>(outcome: FetchOutcome<T>): T {
  if (outcome.error !== undefined || outcome.data === undefined) {
    const problem = (outcome.error ?? {}) as Partial<Schemas["Problem"]>;
    throw new ApiProblem(
      problem.type ?? "about:blank",
      problem.title ?? outcome.response.statusText,
      problem.status ?? outcome.response.status,
      problem.detail ?? null,
    );
  }
  return outcome.data;
}

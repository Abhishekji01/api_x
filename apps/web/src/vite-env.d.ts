/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APIX_API_URL?: string;
  readonly VITE_APIX_API_KEY?: string;
  /** "1" builds the static demo that reads public/snapshot/ instead of a live API. */
  readonly VITE_APIX_STATIC?: string;
  /** The static demo's recording date (YYYY-MM-DD), used as "today" in demo mode. */
  readonly VITE_APIX_SNAPSHOT_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

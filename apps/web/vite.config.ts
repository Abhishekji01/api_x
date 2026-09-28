import { cpSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

/**
 * Two builds from one source:
 *  - the normal build (dist/) talks to a live API;
 *  - the static demo (VITE_APIX_STATIC=1, dist-demo/) reads a recorded snapshot of API
 *    responses from demo-snapshot/ (scripts/harvest-snapshot.mjs), uses relative asset
 *    paths and hash routing, and so runs from any static host or folder, no server rules.
 */
const STATIC_DEMO = process.env.VITE_APIX_STATIC === "1";

function snapshotDate(): string {
  const manifest = resolve(__dirname, "demo-snapshot", "manifest.json");
  if (!existsSync(manifest)) return "";
  return (JSON.parse(readFileSync(manifest, "utf-8")) as { snapshot_date?: string }).snapshot_date ?? "";
}

/** Copy the recorded snapshot next to the demo build. */
function demoSnapshot(): Plugin {
  return {
    name: "apix-demo-snapshot",
    apply: "build",
    closeBundle() {
      const from = resolve(__dirname, "demo-snapshot");
      if (!existsSync(from)) {
        throw new Error("demo-snapshot/ is missing — run `npm run harvest:snapshot` against a live API first");
      }
      cpSync(from, resolve(__dirname, "dist-demo", "snapshot"), { recursive: true });
      cpSync(resolve(from, "openapi.json"), resolve(__dirname, "dist-demo", "openapi.json"));
    },
  };
}

if (STATIC_DEMO && process.env.VITE_APIX_SNAPSHOT_DATE === undefined) {
  process.env.VITE_APIX_SNAPSHOT_DATE = snapshotDate();
}

export default defineConfig({
  base: STATIC_DEMO ? "./" : "/",
  plugins: STATIC_DEMO ? [react(), demoSnapshot()] : [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: STATIC_DEMO ? "dist-demo" : "dist",
    sourcemap: !STATIC_DEMO,
    chunkSizeWarningLimit: 1200,
  },
});

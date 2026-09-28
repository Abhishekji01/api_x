import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter, createHashRouter } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { STATIC_DEMO } from "./lib/staticDemo";
import App from "./App";
import { ThemeProvider } from "./theme/ThemeContext";
import "./index.css";

// Lazy-loaded screen components
const Overview = lazy(() => import("./screens/Overview"));
const AirfareIndex = lazy(() => import("./screens/AirfareIndex"));
const RouteExplorer = lazy(() => import("./screens/RouteExplorer"));
const SectorHeatmap = lazy(() => import("./screens/SectorHeatmap"));
const LeadTime = lazy(() => import("./screens/LeadTime"));
const DataExplorerScreen = lazy(() => import("./screens/DataExplorerScreen"));
const ApiAccessScreen = lazy(() => import("./screens/ApiAccessScreen"));
const MethodConsole = lazy(() => import("./screens/MethodConsole"));
const Audit = lazy(() => import("./screens/Audit"));
const Validation = lazy(() => import("./screens/Validation"));
const Pipeline = lazy(() => import("./screens/Pipeline"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false } },
});

const withSuspense = (element: React.ReactNode) => (
  <Suspense
    fallback={
      <div className="flex h-64 items-center justify-center p-6 text-xs text-ink-2" role="status">
        Loading view…
      </div>
    }
  >
    {element}
  </Suspense>
);

const routes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: withSuspense(<Overview />) },
      { path: "airfare-index", element: withSuspense(<AirfareIndex />) },
      { path: "routes", element: withSuspense(<RouteExplorer />) },
      { path: "leadtime", element: withSuspense(<LeadTime />) },
      { path: "explorer", element: withSuspense(<DataExplorerScreen />) },
      { path: "api-access", element: withSuspense(<ApiAccessScreen />) },
      { path: "reports", element: withSuspense(<MethodConsole />) },
      { path: "settings", element: withSuspense(<Audit />) },
      { path: "heatmap", element: withSuspense(<SectorHeatmap />) },
      { path: "validation", element: withSuspense(<Validation />) },
      { path: "pipeline", element: withSuspense(<Pipeline />) },
      // Legacy route aliases
      { path: "method", element: withSuspense(<MethodConsole />) },
      { path: "audit", element: withSuspense(<Audit />) },
    ],
  },
];

// The static demo uses hash routing, so it runs from any static host or folder with no
// server-side rewrite rules; the live build keeps clean paths.
const router = STATIC_DEMO ? createHashRouter(routes) : createBrowserRouter(routes);

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root is missing from index.html");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

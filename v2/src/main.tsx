import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import FindFit from "./FindFit";
import { createDemoProvider, createWorkerProvider } from "./lib/findFit";
import type { DemoScenario, FitProvider } from "./lib/findFit";
import "./styles/global.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

// The older search-phrase flow stays reachable at #classic until the proof of concept is decided.
const hash = window.location.hash;
const scenarios: Record<string, DemoScenario> = { "#demo-empty": "empty", "#demo-error": "error" };
const scenario = import.meta.env.DEV ? scenarios[hash] ?? "results" : "results";
const apiUrl = import.meta.env.VITE_FITCHECK_API_URL as string | undefined;

function resolveProvider(): FitProvider {
  if (apiUrl) return createWorkerProvider(apiUrl);
  // DEV-only hash so Playwright can exercise the worker UI without changing other e2e cases.
  if (import.meta.env.DEV && hash === "#cloudflare-poc") {
    return createWorkerProvider("http://127.0.0.1:8787");
  }
  return createDemoProvider(scenario);
}

createRoot(rootEl).render(
  <StrictMode>
    {hash === "#classic" ? <App /> : <FindFit provider={resolveProvider()} />}
  </StrictMode>,
);

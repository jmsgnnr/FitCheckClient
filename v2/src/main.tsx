import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import FindFit from "./FindFit";
import { createDemoProvider } from "./lib/findFit";
import type { DemoScenario } from "./lib/findFit";
import "./styles/global.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

// The older search-phrase flow stays reachable at #classic until the proof of concept is decided.
const hash = window.location.hash;
const scenarios: Record<string, DemoScenario> = { "#demo-empty": "empty", "#demo-error": "error" };
const scenario = import.meta.env.DEV ? scenarios[hash] ?? "results" : "results";

createRoot(rootEl).render(
  <StrictMode>
    {hash === "#classic" ? <App /> : <FindFit provider={createDemoProvider(scenario)} />}
  </StrictMode>,
);

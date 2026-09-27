import { env, windowId } from "@akanjs/native/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { runSelftestAndReport } from "./selftest.ts";
import { startUpdates } from "./updates.ts";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Only the window the app opened runs it (windows opened by the test must not report again).
if (env.PUBLIC_SELFTEST === "1" && (windowId ?? 1) === 1) void runSelftestAndReport();
// UP-2: keep a newly downloaded web bundle once the app has rendered.
requestAnimationFrame(() => void startUpdates().catch((error) => console.error("[sample] updates", error)));

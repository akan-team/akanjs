// Web bundle updates (UP-2): the state, and check / download / apply / reset by hand.
// Publish a release with `akan-native update publish <platform>` and serve it with `akan-native update serve`.
import { type UpdateProgress, updates, useUpdateState } from "@akanjs/native/plugins/updates";
import { usePluginEvent } from "@akanjs/native/react";
import { useState } from "react";

export function UpdatesCard() {
  const { state, refresh } = useUpdateState();
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [`${new Date().toLocaleTimeString()} ${line}`, ...lines].slice(0, 6));
  usePluginEvent(updates, "progress", (p: UpdateProgress) =>
    add(`${Math.round((p.received / Math.max(1, p.total)) * 100)}%`),
  );
  if (!updates.isSupported("getState")) return null;

  const run = (label: string, task: () => Promise<unknown>) =>
    task()
      .then((result) => (result !== undefined && add(`${label}: ${JSON.stringify(result)}`), refresh()))
      .catch((e) => add(`${label} failed: ${e?.code ?? ""} ${e?.message ?? e}`));

  return (
    <section className="card">
      <h2>updates</h2>
      <p className="hint">
        Bundle: {state?.bundle ?? "the app's own"}
        {state?.trial ? " (on trial)" : ""}. Pending: {state?.pending ?? "none"}.
        {state?.rolledBack ? ` Rolled back: ${state.rolledBack}.` : ""}
      </p>
      <div className="row">
        <button className="secondary" onClick={() => run("check", () => updates.check())}>
          Check
        </button>
        <button onClick={() => run("download", () => updates.download())}>Download</button>
        <button onClick={() => run("apply", () => updates.apply())}>Apply</button>
        <button className="secondary" onClick={() => run("reset", () => updates.reset())}>
          Reset
        </button>
      </div>
      {log.length > 0 && (
        <ul className="log">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

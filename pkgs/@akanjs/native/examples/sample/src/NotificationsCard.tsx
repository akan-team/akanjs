// Local notifications: permission, a notification in 5 seconds, and the received/action events.
import { localNotifications as ln, type NotificationEvent } from "@akanjs/native/plugins/local-notifications";
import { usePluginEvent } from "@akanjs/native/react";
import { useEffect, useState } from "react";

export function NotificationsCard() {
  const [permission, setPermission] = useState<string>("…");
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [`${new Date().toLocaleTimeString()} ${line}`, ...lines].slice(0, 6));
  const describe = (e: NotificationEvent) => `#${e.id} "${e.title}"${e.data ? ` ${JSON.stringify(e.data)}` : ""}`;
  usePluginEvent(ln, "received", (e) => add(`received ${describe(e)}`));
  usePluginEvent(ln, "action", (e) => add(`clicked ${describe(e)}`));

  useEffect(() => {
    if (ln.isSupported("checkPermission"))
      ln.checkPermission().then(
        ({ display }) => setPermission(display),
        () => setPermission("?"),
      );
  }, []);
  if (!ln.isSupported("schedule")) return null;

  const run = (label: string, task: () => Promise<unknown>) =>
    task().catch((e) => add(`${label} failed: ${e?.code ?? ""} ${e?.message ?? e}`));

  return (
    <section className="card">
      <h2>local-notifications</h2>
      <p className="hint">
        Permission: {permission}. Schedule one, then click its banner (the app may be in the background).
      </p>
      <div className="row">
        <button
          className="secondary"
          onClick={() => run("permission", async () => setPermission((await ln.requestPermission()).display))}
        >
          Ask permission
        </button>
        <button
          onClick={() =>
            run("schedule", async () => {
              const id = Math.floor(Date.now() / 1000) % 1_000_000;
              await ln.schedule({
                notifications: [
                  {
                    id,
                    title: "Akan Native Sample",
                    body: "Scheduled 5 seconds ago",
                    at: Date.now() + 5000,
                    data: { from: "sample" },
                  },
                ],
              });
              add(`scheduled #${id} for 5 s from now`);
            })
          }
        >
          Notify in 5 s
        </button>
        <button
          className="secondary"
          onClick={() =>
            run("lists", async () => {
              const [pending, delivered] = await Promise.all([ln.getPending(), ln.getDelivered()]);
              add(`pending ${pending.notifications.length}, delivered ${delivered.notifications.length}`);
            })
          }
        >
          Lists
        </button>
        <button
          className="secondary"
          onClick={() => run("clear", async () => (await ln.removeAllDelivered(), add("cleared delivered")))}
        >
          Clear
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

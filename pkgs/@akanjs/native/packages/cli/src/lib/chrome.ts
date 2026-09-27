// Headless Chrome over the DevTools protocol, used by `akan-native test web` to read the page console.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliError } from "./log.ts";

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

export function findChrome(): string {
  const found =
    [process.env.AKAN_NATIVE_CHROME, ...CANDIDATES].find((p): p is string => !!p && existsSync(p)) ??
    Bun.which("google-chrome") ??
    Bun.which("chromium");
  if (!found) throw new CliError("no Chrome/Chromium found for `akan-native test web` (set AKAN_NATIVE_CHROME)");
  return found;
}

function formatArg(arg: { type: string; value?: unknown; description?: string }): string {
  if (arg.value !== undefined) return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
  return arg.description ?? arg.type;
}

/** Opens `url` in a fresh headless profile and forwards console lines and exceptions. */
export async function openHeadless(
  url: string,
  onLine: (line: string) => void,
): Promise<{ stop(): void; exited: Promise<number> }> {
  const profile = mkdtempSync(join(tmpdir(), "akan-native-chrome-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = Bun.spawn(
    [
      findChrome(),
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      "about:blank",
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
  );
  let target: { webSocketDebuggerUrl: string } | undefined;
  for (let i = 0; i < 100 && !target; i++) {
    await Bun.sleep(100);
    const list = (await fetch(`http://127.0.0.1:${port}/json`)
      .then((r) => r.json())
      .catch(() => [])) as { type: string; webSocketDebuggerUrl: string }[];
    target = list.find((t) => t.type === "page");
  }
  if (!target) {
    chrome.kill();
    throw new CliError("headless Chrome did not start");
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const send = (method: string, params: object = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.consoleAPICalled") {
      onLine(`[page ${message.params.type}] ${message.params.args.map(formatArg).join(" ")}`);
    } else if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      onLine(`[page error] ${details.exception?.description ?? details.text}`);
    }
  };
  send("Runtime.enable");
  send("Page.enable");
  send("Page.navigate", { url });
  return {
    exited: chrome.exited,
    stop() {
      try {
        ws.close();
      } catch {}
      chrome.kill();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

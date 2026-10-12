// End-to-end check of the external-view plugin and the kiosk window ops on Windows, the one shell with an
// automation port (docs/testing-windows-linux.md):
//
//   bun scripts/vm/windows.ts desktop 'bun scripts/vm/external-view-check.ts'
//
// Builds the sample (debug) with the external-view plugin and a frameless main window, serves a board page from
// this process, and through the app page's bridge checks that a view
// 1. opens over the window, runs its init script before the page's own, and answers evaluate,
// 2. sends load events, and loadFailed for a server that does not answer,
// 3. refuses a navigation off its origins, from the app and from its own page,
// 4. passes warn and error console messages with their source and line, and not a log,
// 5. takes a trusted key press, and captures its own content,
// 6. keeps storage of its own, which clearData clears,
// 7. loads again when its renderer ends, counting restarts, and is built again when its browser process ends,
// and that the window goes onto a display at an exact size in physical pixels, below the default minimum.

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import sampleConfig from "../../examples/sample/akan-native.config.ts";
import { build } from "../../packages/cli/src/api.ts";

if (process.platform !== "win32")
  throw new Error("external-view-check drives WebView2's DevTools port: run it on Windows");

const sample = resolve(import.meta.dir, "../../examples/sample");
const scratch = mkdtempSync(join(tmpdir(), "akan-native-external-view-check-"));
const port = 9232;
const step = (text: string) => console.info(`\n== ${text}`);

const BOARD = `<!doctype html><title>board</title><body style="margin:0;background:#123">
<script>
window.__keys = [];
addEventListener("keydown", (e) => window.__keys.push(e.key + ":" + e.isTrusted));
window.__seen = Number(localStorage.getItem("seen") || 0) + 1;
localStorage.setItem("seen", String(window.__seen));
console.log("tick");
console.warn("slow frame", 120);
setTimeout(() => { throw new Error("boom"); }, 50);
</script></body>`;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (req) =>
    new URL(req.url).pathname === "/board"
      ? new Response(BOARD, { headers: { "content-type": "text/html" } })
      : new Response("<h1>upstream down</h1>", { status: 502, headers: { "content-type": "text/html" } }),
});
const origin = `http://127.0.0.1:${server.port}`;
const closed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
const deadOrigin = `http://127.0.0.1:${closed.port}`;
closed.stop(true);

async function until<T>(what: string, check: () => Promise<T | undefined | false>, timeout = 20_000): Promise<T> {
  let last: unknown;
  for (const started = Date.now(); Date.now() - started < timeout; await Bun.sleep(250)) {
    const value = await check().catch((error) => {
      last = error;
      return undefined;
    });
    if (value) return value;
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (${String(last)})` : ""}`);
}

async function evaluate(expression: string, what: string, timeout = 10_000): Promise<string | undefined> {
  const pages = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as {
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
  }[];
  const page = pages.find((p) => p.type === "page" && p.url.startsWith("https://app.localhost"));
  if (!page) throw new Error("no app page yet");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true } }));
  const answer = await new Promise<{ result?: { result?: { value?: string } } }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}: no answer`)), timeout);
    ws.onmessage = (event) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(event.data)));
    };
  });
  ws.close();
  return answer.result?.result?.value;
}

/** Calls a plugin method from the page, as a page does (the runtime's own request ids). */
async function bridge(
  plugin: string,
  method: string,
  args?: unknown,
): Promise<{ ok: boolean; result?: any; error?: any }> {
  const request = JSON.stringify({ v: 1, plugin, method, ...(args === undefined ? {} : { args }) });
  const expression = `(async () => { const rt = window.__AKAN_NATIVE__.__runtime; const r = ${request};
    r.id = ++rt.nextId; return JSON.stringify(await rt.transport.send(r)); })()`;
  return JSON.parse((await evaluate(expression, `${plugin}.${method}`)) ?? "{}");
}

async function ok(plugin: string, method: string, args?: unknown): Promise<any> {
  const answer = await bridge(plugin, method, args);
  if (!answer.ok) throw new Error(`${plugin}.${method}: ${JSON.stringify(answer.error)}`);
  return answer.result;
}

const EVENTS = ["load", "loadFailed", "gone", "consoleMessage"];

/** Collects the plugin's events in the app page, as listen() does. */
async function listen(): Promise<void> {
  const expression = `(async () => { const rt = window.__AKAN_NATIVE__.__runtime; window.__events = [];
    for (const e of ${JSON.stringify(EVENTS)}) {
      const key = "external-view\\u0000" + e; let set = rt.listeners.get(key);
      if (!set) rt.listeners.set(key, (set = new Set()));
      set.add((data) => window.__events.push({ event: e, data }));
      await rt.transport.send({ v: 1, id: ++rt.nextId, plugin: "external-view", method: "$listen", args: { event: e } });
    } return "listening"; })()`;
  if ((await evaluate(expression, "listen")) !== "listening") throw new Error("could not listen");
}

interface Seen {
  event: string;
  data: Record<string, any>;
}
const events = async (): Promise<Seen[]> =>
  JSON.parse((await evaluate("JSON.stringify(window.__events)", "events")) ?? "[]");
const waitFor = (what: string, match: (e: Seen) => boolean, timeout?: number) =>
  until(what, async () => (await events()).find(match), timeout);
const inView = async (script: string) => (await ok("external-view", "evaluate", { id: "board", script })).value;

function powershell(command: string): string {
  const p = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return p.stdout.toString().trim();
}

const appPids = (name: string) =>
  powershell(`(Get-Process -Name '${name}' -ErrorAction SilentlyContinue).Id -join ','`)
    .split(",")
    .filter(Boolean)
    .map(Number);

/** The view's WebView2 processes: its own profile folder is on their command line. */
const viewProcesses = (type: "renderer" | "browser") =>
  powershell(
    `Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -match 'external-views' -and ${
      type === "browser" ? "$_.CommandLine -notmatch '--type='" : "$_.CommandLine -match '--type=renderer'"
    } } | ForEach-Object { $_.ProcessId }`,
  )
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);

let exeName = "";
const lines: string[] = [];
try {
  step("build the sample with the external-view plugin and a frameless window");
  const [app0, ...rest] = sampleConfig.capabilities ?? [];
  if (!app0) throw new Error("the sample has no capability to extend");
  const { artifacts } = await build({
    appDir: sample,
    config: {
      ...sampleConfig,
      plugins: [...(sampleConfig.plugins ?? []), "external-view"],
      capabilities: [{ ...app0, permissions: [...app0.permissions, "external-view:default"] }, ...rest],
      desktop: { ...sampleConfig.desktop, window: { frameless: true } },
    },
    platform: "windows",
    profile: "debug",
    outDir: join(scratch, "build"),
  });
  const folder = artifacts.find((a) => a.kind === "folder")?.path;
  if (!folder) throw new Error(`no app folder in ${JSON.stringify(artifacts)}`);
  const exe = join(folder, readdirSync(folder).find((n) => n.endsWith(".exe")) ?? "");
  exeName = basename(exe, ".exe");
  for (const pid of appPids(exeName)) process.kill(pid);

  const app = Bun.spawn([exe], {
    env: { ...process.env, AKAN_NATIVE_WEBVIEW2_DEBUG_PORT: String(port), AKAN_NATIVE_QUIT_ON_STDIN: "1" },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  for (const stream of [app.stdout, app.stderr])
    void (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of stream) lines.push(...decoder.decode(chunk).split(/\r?\n/));
    })();
  await until("the app page", async () => (await bridge("app", "getInfo")).ok);
  await listen();

  step("0. the window goes onto display 0 at 640×128 device pixels, below the default minimum size");
  const displays = await ok("screen", "getDisplays");
  const scale = displays[0].scale as number;
  const placed = await ok("window", "placeOnDisplay", {
    index: 0,
    bounds: { x: 0, y: 0, width: 640, height: 128 },
    unit: "physical",
  });
  console.info(`  scale ${scale}: ${JSON.stringify(placed)}`);
  if (Math.abs(placed.width - 640 / scale) > 1 || Math.abs(placed.height - 128 / scale) > 1)
    throw new Error("the window is not 640×128 device pixels");
  await ok("window", "setAlwaysOnTop", { value: true });
  await ok("window", "setCursorVisible", { value: false });
  await ok("window", "placeOnDisplay", { index: 0, bounds: { x: 40, y: 40, width: 800, height: 600 } });

  step("1. a view opens over the window, its init script first, and answers evaluate");
  const opened = await ok("external-view", "open", {
    id: "board",
    url: `${origin}/board`,
    allowOrigins: [origin, deadOrigin],
    initScript: "window.__alive = typeof window.__keys",
    console: true,
  });
  console.info(`  ${JSON.stringify(opened)}`);
  if (opened.url !== `${origin}/board`) throw new Error(`open answered ${opened.url}`);
  await waitFor("the board loaded", (e) => e.event === "load" && e.data.state === "finished");
  if ((await inView("window.__alive")) !== "undefined") throw new Error("the init script did not run first");
  if ((await inView("document.title")) !== "board") throw new Error("evaluate does not answer");

  step("2. loadFailed for a server that does not answer, and for a server's error page");
  await ok("external-view", "navigate", { id: "board", url: `${deadOrigin}/` });
  const failed = await waitFor("loadFailed", (e) => e.event === "loadFailed");
  console.info(`  ${JSON.stringify(failed.data)}`);
  if (failed.data.errorCode !== "unknown") throw new Error(`a refused connection is ${failed.data.errorCode}`);
  await ok("external-view", "navigate", { id: "board", url: `${origin}/down` });
  const status = await waitFor("an http failure", (e) => e.event === "loadFailed" && e.data.url.endsWith("/down"));
  console.info(`  ${JSON.stringify(status.data)}`);
  if (status.data.errorCode !== "http502") throw new Error(`a 502 page is ${status.data.errorCode}`);
  await ok("external-view", "navigate", { id: "board", url: `${origin}/board` });
  await until("the board again", async () => (await inView("document.title")) === "board");

  step("3. a navigation off its origins is refused, from the app and from its page");
  const refused = await bridge("external-view", "navigate", { id: "board", url: "https://example.com/" });
  if (refused.error?.code !== "NOT_ALLOWED") throw new Error(`navigate answered ${JSON.stringify(refused)}`);
  await inView(`location.href = "https://example.com/"; "sent"`);
  await Bun.sleep(1500);
  if ((await inView("location.origin")) !== origin) throw new Error("the page left its origins");

  step("4. warn and error reach the app with source and line, a log does not");
  const consoleSeen = await until("warn and error", async () => {
    const seen = (await events()).filter((e) => e.event === "consoleMessage").map((e) => e.data);
    return seen.some((m) => m.level === "warn") && seen.some((m) => m.level === "error") ? seen : undefined;
  });
  for (const m of consoleSeen.slice(0, 2)) console.info(`  ${JSON.stringify(m)}`);
  if (consoleSeen.some((m) => m.text === "tick")) throw new Error("a log passed the warn level");
  const warn = consoleSeen.find((m) => m.level === "warn");
  if (!warn?.url?.endsWith("/board") || typeof warn.line !== "number") throw new Error("the warning has no source");

  step("5. a trusted key press, and a capture of the view's content");
  await ok("external-view", "sendKey", { id: "board", key: "z", code: "KeyZ" });
  const keys = await inView("window.__keys.join()");
  if (!String(keys).includes("z:true")) throw new Error(`the page saw ${keys}`);
  const shot = await ok("external-view", "capture", { id: "board" });
  console.info(`  capture ${shot.width}×${shot.height}`);
  if (!(shot.width > 0 && shot.height > 0)) throw new Error("no capture");
  await ok("external-view", "setMuted", { id: "board", muted: true });

  step("6. storage of its own, cleared by clearData");
  const seenBefore = await inView("window.__seen");
  await ok("external-view", "reload", { id: "board" });
  await until("a reload", async () => (await inView("window.__seen")) === seenBefore + 1);
  await ok("external-view", "clearData", { id: "board" });
  await ok("external-view", "reload", { id: "board" });
  await until("storage cleared", async () => (await inView("window.__seen")) === 1);
  const appStorage = await evaluate("typeof localStorage.getItem('seen')", "app storage");
  if (appStorage !== "object") throw new Error("the view's storage reached the app's");

  step("7. its renderer ends: loaded again, counted");
  const renderers = viewProcesses("renderer");
  if (!renderers.length) throw new Error("no renderer of the view");
  for (const pid of renderers) process.kill(pid);
  const gone = await waitFor("gone", (e) => e.event === "gone");
  console.info(`  ${JSON.stringify(gone.data)}`);
  await until("the board after the crash", async () => (await inView("document.title")) === "board");

  step("7b. its browser process ends: built again, at its page, with its options");
  const [browser] = viewProcesses("browser");
  if (!browser) throw new Error("no browser process of the view");
  process.kill(browser);
  await waitFor("browserExited", (e) => e.event === "gone" && e.data.reason === "browserExited");
  await until("the board in a new webview", async () => (await inView("document.title")) === "board", 30_000);
  const [listed] = await ok("external-view", "list");
  console.info(`  ${JSON.stringify(listed)}`);
  if (listed.restarts < 2) throw new Error("the restarts were not counted");
  if ((await inView("window.__alive")) !== "undefined") throw new Error("the rebuilt view lost its init script");

  step("8. the window's hidden pointer stays hidden over the view, through reloads and a rebuild, until shown");
  const cursorNone = 'document.getElementById("__akan_cursor_none") !== null';
  if ((await inView(cursorNone)) !== true) throw new Error("the pointer shows over the view");
  await ok("window", "setCursorVisible", { value: true });
  await ok("external-view", "reload", { id: "board" });
  await until("the board reloaded", async () => (await inView("document.title")) === "board");
  if ((await inView(cursorNone)) !== false) throw new Error("the pointer stays hidden after it was shown");
  await ok("window", "setCursorVisible", { value: false });
  await ok("external-view", "reload", { id: "board" });
  await until("the board reloaded", async () => (await inView("document.title")) === "board");
  if ((await inView(cursorNone)) !== true) throw new Error("a reloaded page shows the pointer");

  await ok("external-view", "close", { id: "board" });
  if ((await ok("external-view", "list")).length !== 0) throw new Error("the view is still listed");
  console.info("\nexternal-view-check passed");
} catch (error) {
  console.error(`the app's last lines:\n${lines.slice(-40).join("\n")}`);
  throw error;
} finally {
  server.stop(true);
  if (exeName) for (const pid of appPids(exeName)) process.kill(pid);
  if (exeName) await until("the app to be gone", async () => appPids(exeName).length === 0).catch(() => {});
  if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

// End-to-end check of the external-view plugin and the kiosk window ops on Windows, the one shell with an
// automation port (docs/testing-windows-linux.md):
//
//   bun scripts/vm/windows.ts desktop 'bun scripts/vm/external-view-check.ts'
//
// Builds the sample (debug) with the external-view plugin and a frameless main window, serves a board page from
// this process, and through the app page's bridge checks that a view
// 1. opens over the window, runs its init script before the page's own, and answers evaluate,
// 2. sends load events, and loadFailed for a server that does not answer,
// 3. refuses a navigation off its origins, from the app and from its own page, and a frame's mailto: link,
// 4. passes warn and error console messages with their source and line, and not a log,
// 5. takes a trusted key press, and captures its own content,
// 6. keeps storage of its own, which clearData clears,
// 7. loads again when its renderer ends, counting restarts, and is built again when its browser process ends,
// 8. keeps the window's hidden pointer hidden over it and its cross-site frame, and shows it in both again,
// 9. as the app's own page does in an unattended app, prints nothing, opens no file dialog from a trusted key press,
//    and (the app page) hands no link to the OS and saves no download,
// 10. shows the app's backgroundColor, not white, until its page paints,
// and that the window goes onto a display at an exact size in physical pixels, below the default minimum, and the
// executable names the app as its company when no publisher is set.

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import sampleConfig from "../../examples/sample/akan-native.config.ts";
import { build } from "../../packages/cli/src/api.ts";
import { AppPage, powershell, until } from "./harness.ts";

if (process.platform !== "win32")
  throw new Error("external-view-check drives WebView2's DevTools port: run it on Windows");

const sample = resolve(import.meta.dir, "../../examples/sample");
const scratch = mkdtempSync(join(tmpdir(), "akan-native-external-view-check-"));
const port = 9232;
const step = (text: string) => console.info(`\n== ${text}`);

const BOARD = `<!doctype html><title>board</title><body style="margin:0;background:#123">
<script>
addEventListener("message", (e) => { if (typeof e.data?.cursorNone === "boolean") window.__frame = e.data; });
const frame = document.createElement("iframe");
frame.src = "http://localhost:" + location.port + "/frame";
frame.style = "width:40px;height:40px;border:0";
document.body.append(frame);
window.__keys = [];
addEventListener("keydown", (e) => window.__keys.push(e.key + ":" + e.isTrusted));
window.__seen = Number(localStorage.getItem("seen") || 0) + 1;
localStorage.setItem("seen", String(window.__seen));
console.log("tick");
console.warn("slow frame", 120);
setTimeout(() => { throw new Error("boom"); }, 50);
</script></body>`;
const FRAME = `<!doctype html><title>frame</title><body style="margin:0">
<script>
setInterval(() => parent.postMessage({
  cursorNone: document.getElementById("__akan_cursor_none") !== null,
  nativePrint: String(window.print).includes("[native code]"),
}, "*"), 200);
</script></body>`;
const BACKGROUND = "204060";
const SLOW = `<!doctype html><title>slow</title><body style="margin:0;background:#00aa00"></body>`;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (req) => {
    const { pathname } = new URL(req.url);
    if (pathname === "/board") return new Response(BOARD, { headers: { "content-type": "text/html" } });
    if (pathname === "/frame") return new Response(FRAME, { headers: { "content-type": "text/html" } });
    if (pathname === "/slow") {
      await Bun.sleep(5_000);
      return new Response(SLOW, { headers: { "content-type": "text/html" } });
    }
    return new Response("<h1>upstream down</h1>", { status: 502, headers: { "content-type": "text/html" } });
  },
});
const origin = `http://127.0.0.1:${server.port}`;
const closed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
const deadOrigin = `http://127.0.0.1:${closed.port}`;
closed.stop(true);

const page = new AppPage(port);

async function evaluate(expression: string, what: string, timeout?: number): Promise<string | undefined> {
  const answer = await page.evaluate(expression, what, timeout);
  if (answer.exception) throw new Error(`${what} threw in the page: ${answer.exception}`);
  return answer.value;
}

/** Space on the app page's focused element, as a person presses it: a trusted keyDown and keyUp. */
async function appSpace(): Promise<void> {
  const key = { key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
  await page.call("Input.dispatchKeyEvent", { type: "keyDown", ...key, text: " ", unmodifiedText: " " }, "keyDown");
  await page.call("Input.dispatchKeyEvent", { type: "keyUp", ...key }, "keyUp");
}

const bridge = (plugin: string, method: string, args?: unknown) => page.bridge(plugin, method, args);

async function ok<T = unknown>(plugin: string, method: string, args?: unknown): Promise<T> {
  const answer = await bridge(plugin, method, args);
  if (!answer.ok) throw new Error(`${plugin}.${method}: ${JSON.stringify(answer.error)}`);
  return answer.result as T;
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
  data: {
    id?: string;
    state?: string;
    url?: string;
    errorCode?: string;
    reason?: string;
    level?: string;
    text?: string;
    line?: number;
  };
}
const events = async (): Promise<Seen[]> =>
  JSON.parse((await evaluate("JSON.stringify(window.__events)", "events")) ?? "[]");
const waitFor = (what: string, match: (e: Seen) => boolean, timeout?: number) =>
  until(what, async () => (await events()).find(match), timeout);
const inView = async (script: string) =>
  (await ok<{ value: unknown }>("external-view", "evaluate", { id: "board", script })).value;

/** One screen pixel as rrggbb, read in device pixels whatever the display scale. */
const screenPixel = (x: number, y: number) =>
  powershell(
    `Add-Type -AssemblyName System.Drawing; Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'; [Dpi]::SetProcessDPIAware() | Out-Null; $b = New-Object System.Drawing.Bitmap 1,1; [System.Drawing.Graphics]::FromImage($b).CopyFromScreen(${Math.round(x)}, ${Math.round(y)}, 0, 0, $b.Size); $c = $b.GetPixel(0,0); '{0:x2}{1:x2}{2:x2}' -f $c.R,$c.G,$c.B`,
  );

/** Visible top-level dialogs on the desktop (#32770): a file dialog is one; WebView2's print preview is in the page. */
const dialogs = () =>
  Number(
    powershell(
      `Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices; public static class Dialogs { public delegate bool Proc(IntPtr h, IntPtr l); [DllImport("user32.dll")] static extern bool EnumWindows(Proc f, IntPtr l); [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h); public static int Count() { int n = 0; EnumWindows((h, l) => { var s = new StringBuilder(64); GetClassName(h, s, 64); if (s.ToString() == "#32770" && IsWindowVisible(h)) n++; return true; }, IntPtr.Zero); return n; } }'; [Dialogs]::Count()`,
    ),
  );

const appPids = (name: string) =>
  powershell(`(Get-Process -Name '${name}' -ErrorAction SilentlyContinue).Id -join ','`)
    .split(",")
    .filter(Boolean)
    .map(Number);

/** The view's WebView2 processes: its own profile folder is on their command line. */
const viewProcesses = (type: "renderer" | "browser") =>
  powershell(
    `Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -match '\\\\ev\\\\[0-9a-f]{8}' -and ${
      type === "browser" ? "$_.CommandLine -notmatch '--type='" : "$_.CommandLine -match '--type=renderer'"
    } } | ForEach-Object { $_.ProcessId }`,
  )
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);

let exeName = "";
const lines: string[] = [];
try {
  step("build the sample with the external-view plugin, a frameless window and desktop.recovery reload (unattended)");
  const [app0, ...rest] = sampleConfig.capabilities ?? [];
  if (!app0) throw new Error("the sample has no capability to extend");
  const { artifacts } = await build({
    appDir: sample,
    config: {
      ...sampleConfig,
      plugins: [...(sampleConfig.plugins ?? []), "external-view"],
      capabilities: [{ ...app0, permissions: [...app0.permissions, "external-view:default"] }, ...rest],
      desktop: { ...sampleConfig.desktop, window: { frameless: true }, recovery: "reload" },
      shell: { ...sampleConfig.shell, backgroundColor: `#${BACKGROUND}`, backgroundColorDark: `#${BACKGROUND}` },
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
  const company = powershell(`(Get-Item '${exe}').VersionInfo.CompanyName`);
  console.info(`  CompanyName ${company}`);
  if (company !== sampleConfig.app.name) throw new Error(`the executable's company is ${company}, not the app's name`);

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
  const [display] = await ok<{ scale: number }[]>("screen", "getDisplays");
  if (!display) throw new Error("no display to place the window on");
  const scale = display.scale;
  const placed = await ok<{ width: number; height: number }>("window", "placeOnDisplay", {
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
  const opened = await ok<{ url: string }>("external-view", "open", {
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
  const status = await waitFor(
    "an http failure",
    (e) => e.event === "loadFailed" && e.data.url?.endsWith("/down") === true,
  );
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
  await inView(`const mail = document.createElement("iframe"); mail.src = "mailto:board@example.com";
    document.body.append(mail); "sent"`);
  await until("a frame's mailto: refused", async () =>
    lines.some((line) => line.includes("refused a frame navigation to mailto:board@example.com")),
  );

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
  const shot = await ok<{ width?: number; height?: number }>("external-view", "capture", { id: "board" });
  console.info(`  capture ${shot.width}×${shot.height}`);
  if (!((shot.width ?? 0) > 0 && (shot.height ?? 0) > 0)) throw new Error("no capture");
  await ok("external-view", "setMuted", { id: "board", muted: true });

  step("6. storage of its own, cleared by clearData");
  const seenBefore = Number(await inView("window.__seen"));
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
  const [listed] = await ok<{ restarts: number }[]>("external-view", "list");
  console.info(`  ${JSON.stringify(listed)}`);
  if ((listed?.restarts ?? 0) < 2) throw new Error("the restarts were not counted");
  if ((await inView("window.__alive")) !== "undefined") throw new Error("the rebuilt view lost its init script");

  step("8. the window's hidden pointer stays hidden over the view, through reloads and a rebuild, until shown");
  const cursorNone = 'document.getElementById("__akan_cursor_none") !== null';
  const frameCursorNone = "window.__frame?.cursorNone";
  if ((await inView(cursorNone)) !== true) throw new Error("the pointer shows over the view");
  await until("the pointer hidden over its cross-site frame", async () => (await inView(frameCursorNone)) === true);
  await ok("window", "setCursorVisible", { value: true });
  await until("the pointer shown over the view", async () => (await inView(cursorNone)) === false);
  await until(
    "the pointer shown over its frame, without a reload",
    async () => (await inView(frameCursorNone)) === false,
  );
  await ok("window", "setCursorVisible", { value: false });
  await until("the pointer hidden over its frame again", async () => (await inView(frameCursorNone)) === true);
  await ok("window", "setCursorVisible", { value: true });
  await ok("external-view", "reload", { id: "board" });
  await until("the board reloaded", async () => (await inView("document.title")) === "board");
  if ((await inView(cursorNone)) !== false) throw new Error("the pointer stays hidden after it was shown");
  await ok("window", "setCursorVisible", { value: false });
  await ok("external-view", "reload", { id: "board" });
  await until("the board reloaded", async () => (await inView("document.title")) === "board");
  if ((await inView(cursorNone)) !== true) throw new Error("a reloaded page shows the pointer");

  step("9. an unattended app's pages, the view's and its frame's included, open no way out of the kiosk");
  if ((await inView('String(window.print).includes("[native code]")')) !== false) throw new Error("the view can print");
  await until("its frame's print replaced", async () => (await inView("window.__frame?.nativePrint")) === false);
  if ((await inView('window.print(); "returned"')) !== "returned") throw new Error("the view's print opened a dialog");
  if ((await evaluate('window.print(); "returned"', "the app page's print", 5_000)) !== "returned")
    throw new Error("the app page's print opened a dialog");
  const blankFramePrint = `{ const frame = document.createElement("iframe"); document.body.append(frame);
    const native = String(frame.contentWindow.print).includes("[native code]"); frame.contentWindow.print(); frame.remove();
    native ? "native" : "replaced" }`;
  if ((await inView(blankFramePrint)) !== "replaced") throw new Error("a frame the view's script made can print");
  if ((await evaluate(blankFramePrint, "a frame the app page's script made", 5_000)) !== "replaced")
    throw new Error("a frame the app page's script made can print");
  const shown = dialogs();
  const fileInput = `{ const pick = document.createElement("input"); pick.type = "file"; document.body.append(pick);
    pick.focus(); "ready" }`;
  await inView(fileInput);
  await ok("external-view", "sendKey", { id: "board", key: " ", code: "Space" });
  await evaluate(fileInput, "a file input on the app page");
  await appSpace();
  await Bun.sleep(1_500);
  if (dialogs() !== shown) throw new Error("a file input opened a file dialog");
  await evaluate('location.href = "mailto:kiosk@example.com"; window.open("https://example.com/"); "sent"', "links");
  await until(
    "the app page's links kept from the OS",
    async () =>
      lines.some((line) => line.includes("not opening mailto:kiosk@example.com")) &&
      lines.some((line) => line.includes("not opening https://example.com/")),
  );
  await evaluate(
    `{ const save = document.createElement("a"); save.href = URL.createObjectURL(new Blob(["kiosk"]));
      save.download = "kiosk.txt"; document.body.append(save); save.click(); "sent" }`,
    "a download",
  );
  await until("the app page's download refused", async () =>
    lines.some((line) => line.includes("refused a download of blob:")),
  );

  step("10. a view shows the app's backgroundColor, not white, until its page paints");
  await ok("external-view", "close", { id: "board" });
  await ok("window", "setCursorVisible", { value: true });
  await ok("external-view", "open", {
    id: "slow",
    url: `${origin}/slow`,
    allowOrigins: [origin],
    bounds: { x: 100, y: 100, width: 200, height: 150 },
  });
  await Bun.sleep(1_500);
  const at = { x: (40 + 200) * scale, y: (40 + 175) * scale };
  const before = screenPixel(at.x, at.y);
  await waitFor(
    "the slow page loaded",
    (e) => e.event === "load" && e.data.state === "finished" && e.data.id === "slow",
  );
  await Bun.sleep(500);
  const after = screenPixel(at.x, at.y);
  console.info(`  before its page: ${before}, after: ${after}`);
  if (after !== "00aa00") throw new Error(`the sampled pixel is not the view's (${after} after its page painted)`);
  if (before !== BACKGROUND) throw new Error(`the view showed ${before} before its page, not the app's ${BACKGROUND}`);

  await ok("external-view", "close", { id: "slow" });
  if ((await ok<unknown[]>("external-view", "list")).length !== 0) throw new Error("the view is still listed");
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

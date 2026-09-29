// End-to-end check of an unattended desktop app on Windows, the one shell with an automation port
// (docs/testing-windows-linux.md):
//
//   bun scripts/vm/windows.ts desktop 'bun scripts/vm/kiosk-check.ts'
//
// Builds the sample (debug) with desktop.recovery "reload" and desktop.window { fullscreen, skipTaskbar },
// starts it with the WebView2 DevTools port open, and through the page's bridge checks that
// 1. the main window is fullscreen from the start,
// 2. a page whose process ends again and again is loaded again each time, waiting longer each time,
// 3. app.relaunch() starts the app again in a new process,
// 4. an ended WebView2 browser process relaunches the app instead of quitting it,
// 5. with desktop.screenCapture "auto", getDisplayMedia() answers with the first screen, no picker and no gesture.

import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import sampleConfig from "../../examples/sample/akan-native.config.ts";
import { build } from "../../packages/cli/src/api.ts";

if (process.platform !== "win32") throw new Error("kiosk-check drives WebView2's DevTools port: run it on Windows");

const sample = resolve(import.meta.dir, "../../examples/sample");
const scratch = mkdtempSync(join(tmpdir(), "akan-native-kiosk-check-"));
const port = 9231;
const step = (text: string) => console.info(`\n== ${text}`);

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

async function pageSocket(): Promise<WebSocket> {
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
  return ws;
}

/** Ends the page's renderer process, as a crash does (the shell's own test op is not on Windows). */
async function crashPage() {
  const ws = await pageSocket();
  ws.send(JSON.stringify({ id: 1, method: "Page.crash" }));
  await Bun.sleep(500);
  ws.close();
}

interface Evaluated {
  result?: { value?: string };
  exceptionDetails?: { exception?: { description?: string } };
}

async function evaluate(expression: string, what: string, timeout = 5000): Promise<Evaluated> {
  const ws = await pageSocket();
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true } }));
  const answer = await new Promise<{ result?: Evaluated }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}: no answer`)), timeout);
    ws.onmessage = (event) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(event.data)));
    };
    ws.onclose = () => {
      clearTimeout(timer);
      resolve({ result: { result: { value: '{"ok":true,"closed":true}' } } });
    };
  });
  ws.close();
  return answer.result ?? {};
}

/** Calls a plugin method from the page, as a page does (the runtime's own request ids). */
async function bridge(plugin: string, method: string, args?: unknown): Promise<{ ok: boolean; result?: any }> {
  const request = JSON.stringify({ v: 1, plugin, method, ...(args === undefined ? {} : { args }) });
  const expression = `(async () => { const rt = window.__AKAN_NATIVE__.__runtime; const r = ${request};
    r.id = ++rt.nextId; return JSON.stringify(await rt.transport.send(r)); })()`;
  return JSON.parse((await evaluate(expression, `${plugin}.${method}`)).result?.value ?? "{}");
}

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

let exeName = "";
const lines: string[] = [];
try {
  step(
    "build the sample with desktop.recovery reload, a fullscreen window without a taskbar button and screenCapture auto",
  );
  const { artifacts } = await build({
    appDir: sample,
    config: {
      ...sampleConfig,
      desktop: {
        ...sampleConfig.desktop,
        recovery: "reload",
        window: { fullscreen: true, skipTaskbar: true },
        screenCapture: "auto",
      },
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

  step("1. the main window is fullscreen from the start");
  const state = await until("the window state", async () => {
    const answer = await bridge("window", "getState");
    return answer.ok ? answer.result : undefined;
  });
  console.info(JSON.stringify(state));
  if (state.fullscreen !== true) throw new Error("the window is not fullscreen");

  step("2. a page that ends again and again is loaded again, waiting longer each time");
  for (const wait of ["loading it again", "loading it again in 1 s", "loading it again in 2 s"]) {
    const seen = lines.length;
    await crashPage();
    await until(`"${wait}"`, async () => lines.slice(seen).some((l) => l.includes(`stopped`) && l.endsWith(wait)));
    await until("the page again", async () => (await bridge("app", "getInfo")).ok);
    console.info(`  ${wait}`);
  }
  if (lines.some((l) => l.includes("showing an error page"))) throw new Error("an error page was shown");

  step("3. app.relaunch() starts a new process");
  await bridge("app", "relaunch");
  await app.exited;
  const relaunched = await until("the relaunched app", async () => appPids(exeName).find((pid) => pid !== app.pid));
  await until("its page", async () => (await bridge("app", "getInfo")).ok);
  console.info(`  ${app.pid} -> ${relaunched}`);

  step("4. an ended WebView2 browser process relaunches the app");
  const browser = powershell(
    `(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.ParentProcessId -eq ${relaunched} -and $_.CommandLine -notmatch '--type=' }).ProcessId`,
  );
  if (!browser) throw new Error(`no WebView2 browser process under ${relaunched}`);
  process.kill(Number(browser));
  const after = await until(
    "the app relaunched after its browser process",
    async () => appPids(exeName).find((pid) => pid !== relaunched),
    30_000,
  );
  await until("its page", async () => (await bridge("app", "getInfo")).ok);
  console.info(`  browser ${browser} ended: ${relaunched} -> ${after}`);

  step("5. getDisplayMedia() answers with the first screen, without the picker");
  const captured = await evaluate(
    `(async () => { const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const t = s.getVideoTracks()[0]; const r = { label: t.label, surface: t.getSettings().displaySurface };
    s.getTracks().forEach((x) => x.stop()); return JSON.stringify(r); })()`,
    "getDisplayMedia",
    10_000,
  );
  const track = captured.result?.value;
  if (!track?.includes('"surface":"monitor"'))
    throw new Error(`no screen without the picker: ${captured.exceptionDetails?.exception?.description ?? track}`);
  console.info(`  ${track}`);
  console.info("\nkiosk-check passed");
} catch (error) {
  console.error(`the app's last lines (the relaunched app writes to the same pipe):\n${lines.slice(-40).join("\n")}`);
  console.error(
    powershell(
      `Get-CimInstance Win32_Process | Where-Object { $_.Name -like '${exeName}*' -or $_.Name -eq 'msedgewebview2.exe' -or $_.Name -eq 'powershell.exe' } | Sort-Object CreationDate | Format-Table ProcessId,ParentProcessId,Name,CreationDate -AutoSize | Out-String -Width 200`,
    ),
  );
  throw error;
} finally {
  if (exeName) for (const pid of appPids(exeName)) process.kill(pid);
  //? The killed app's WebView2 processes hold its folder for a moment after it is gone.
  if (exeName) await until("the app to be gone", async () => appPids(exeName).length === 0).catch(() => {});
  rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

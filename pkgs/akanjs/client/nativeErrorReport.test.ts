import "../test/registerDom";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import path from "node:path";
import { resetEnvCache } from "akanjs/base";
import { NativeErrorReport } from "./nativeErrorReport";

const server = "https://api.shop.test";
const requestId = "0af7651916cd43dd8448eb211c80319c.AAAAAAAAAAAAAAAAAAAAAA";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const calls: { url: string; init: RequestInit }[] = [];
const spies: { mockRestore: () => void }[] = [];
const listeners: [string, EventListenerOrEventListenerObject][] = [];
const savedEnv = Object.fromEntries(
  ["AKAN_PUBLIC_APP_NAME", "AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"].map((key) => [key, process.env[key]]),
);
let answer = () => new Response(requestId, { status: 200 });

const openShell = (platform: string) => {
  (globalThis as { __AKAN_NATIVE__?: unknown }).__AKAN_NATIVE__ = {
    platform,
    env: { PUBLIC_AKAN_SERVER_URL: `${server}/api` },
  };
  NativeErrorReport.listen();
};
const asks = () => calls.filter(({ init }) => (init.method ?? "GET") === "GET");
const posts = () => calls.filter(({ init }) => init.method === "POST");
const bodies = () => posts().map(({ init }) => JSON.parse(String(init.body)) as Record<string, unknown>);
const reject = (reason: unknown) => window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason }));

beforeEach(() => {
  Object.assign(process.env, {
    AKAN_PUBLIC_APP_NAME: "shop",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "shop.test",
  });
  resetEnvCache();
  answer = () => new Response(requestId, { status: 200 });
  const add = window.addEventListener.bind(window);
  spies.push(
    spyOn(window, "addEventListener").mockImplementation(((type: string, listener: EventListener) => {
      listeners.push([type, listener]);
      add(type, listener);
    }) as typeof window.addEventListener),
    spyOn(globalThis, "fetch").mockImplementation((async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return init.method === "POST" ? new Response(null, { status: 204 }) : answer();
    }) as unknown as typeof fetch),
  );
});
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
  for (const [type, listener] of listeners.splice(0)) window.removeEventListener(type, listener);
  calls.length = 0;
  NativeErrorReport.reset();
  delete (globalThis as { __AKAN_NATIVE__?: unknown }).__AKAN_NATIVE__;
  for (const [key, value] of Object.entries(savedEnv))
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  resetEnvCache();
});

describe("NativeErrorReport", () => {
  test("asks the app's server for an id at a shell page's first error, then sends each error to it", async () => {
    openShell("android");
    const failure = new TypeError("price was undefined");
    window.dispatchEvent(new ErrorEvent("error", { error: failure }));
    reject(Object.assign(new Error("camera.take failed: IllegalStateException"), { name: "AkanNativeError" }));
    await sleep(50);

    expect(asks()).toEqual([
      {
        url: `${server}/_akan/client-report`,
        init: { credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" },
      },
    ]);
    expect(posts().map(({ url, init }) => [url, init.mode, init.credentials])).toEqual([
      [`${server}/_akan/client-report`, undefined, "omit"],
      [`${server}/_akan/client-report`, undefined, "omit"],
    ]);
    expect(bodies()).toEqual([
      {
        requestId,
        routeId: null,
        kind: "error",
        name: "TypeError",
        message: "price was undefined",
        digest: null,
        shell: "android",
        stack: failure.stack,
      },
      expect.objectContaining({ kind: "rejection", name: "AkanNativeError", shell: "android" }),
    ]);
  });

  test("sends nothing when the server gives no id, and asks again only once that answer has aged", async () => {
    answer = () => new Response(null, { status: 404 });
    openShell("macos");
    const now = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(now);
    spies.push(clock);
    for (let i = 0; i < 3; i += 1) window.dispatchEvent(new ErrorEvent("error", { error: new Error(`failed ${i}`) }));
    await sleep(30);
    expect([asks().length, posts().length]).toEqual([1, 0]);

    answer = () => new Response(requestId, { status: 200 });
    clock.mockReturnValue(now + NativeErrorReport.answerLifetimeMs);
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("later") }));
    await sleep(30);
    expect([asks().length, bodies().map(({ message, shell }) => [message, shell])]).toEqual([2, [["later", "macos"]]]);
  });

  test("asks again a minute after an ask that never reached the server", async () => {
    answer = () => {
      throw new TypeError("Load failed");
    };
    openShell("ios");
    const now = Date.now();
    const clock = spyOn(Date, "now").mockReturnValue(now);
    spies.push(clock);
    reject(new TypeError("Load failed"));
    reject(new Error("still offline"));
    await sleep(30);
    expect([asks().length, posts().length]).toEqual([1, 0]);

    answer = () => new Response(requestId, { status: 200 });
    clock.mockReturnValue(now + NativeErrorReport.retryMs);
    reject(new Error("back online"));
    await sleep(30);
    expect([asks().length, bodies().map(({ message, shell }) => [message, shell])]).toEqual([
      2,
      [["back online", "ios"]],
    ]);
  });

  test("listens on no page outside a shell", async () => {
    NativeErrorReport.listen();
    openShell("web");
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("ignored") }));
    await sleep(20);

    expect([listeners, calls]).toEqual([[], []]);
  });

  //? A child process: core starts once per process.
  test("listens from the moment a shell's page loads its native bridge", async () => {
    const nativeHost = JSON.stringify(path.join(import.meta.dir, "nativeHost.ts"));
    const proc = Bun.spawn(
      [
        process.execPath,
        "-e",
        `const seen = [];
globalThis.addEventListener = (type) => void seen.push(type);
globalThis.window = globalThis;
globalThis.__AKAN_NATIVE__ = { platform: "ios" };
await import(${nativeHost});
for (let i = 0; i < 40 && !seen.includes("unhandledrejection"); i++) await Bun.sleep(25);
console.info(JSON.stringify(seen.filter((type) => type === "error" || type === "unhandledrejection")));`,
      ],
      { stdout: "pipe", stderr: "pipe", timeout: 10_000 },
    );
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect([stdout.trim(), exitCode]).toEqual(['["error","unhandledrejection"]', 0]);
  });

  test("stays out of what a web page loads", async () => {
    const result = await Bun.build({
      entrypoints: [path.join(import.meta.dir, "index.ts")],
      target: "browser",
      format: "esm",
      splitting: true,
      metafile: true,
      throw: true,
    });
    const outputs = result.metafile?.outputs ?? {};
    const eager = new Set<string>();
    const load = (outputPath: string) => {
      if (eager.has(outputPath) || !outputs[outputPath]) return;
      eager.add(outputPath);
      for (const imp of outputs[outputPath].imports) if (imp.kind === "import-statement") load(imp.path);
    };
    for (const [outputPath, output] of Object.entries(outputs))
      if (output.entryPoint?.endsWith("client/index.ts")) load(outputPath);
    const isReporting = (input: string) => /(nativeErrorReport|rscClientErrorSender|reportText)\.ts$/.test(input);
    expect(
      [...eager].flatMap((outputPath) => Object.keys(outputs[outputPath]?.inputs ?? {})).filter(isReporting),
    ).toEqual([]);
    expect(Object.keys(result.metafile?.inputs ?? {}).filter(isReporting).length).toBe(3);
  });
});

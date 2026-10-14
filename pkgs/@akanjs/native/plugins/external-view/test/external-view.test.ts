import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { fakeHost } from "../../menu/test/fake-host.ts";
import manifest from "../native-plugin.json";
import {
  CONSOLE_BURST,
  consoleLevel,
  consoleMessageOf,
  createConsoleCap,
  createDesktopExternalView,
  virtualKey,
} from "../src/desktop.ts";

const opened = { view: "board", window: 1, url: "https://cus.example/screen/1/2", visible: true, restarts: 0 };
const answer = (op: string) => (op === "externalView.open" ? opened : op === "externalView.list" ? [opened] : null);

describe("external-view plugin", () => {
  test("is a desktop plugin only", () => {
    const plugin = { spec: "external-view", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "ios")).toEqual({});
    expect(pluginDecls([plugin], "android")).toEqual({});
    expect(pluginDecls([plugin], "windows")).toEqual({
      "external-view": { methods: manifest.methods, events: manifest.events },
    });
  });

  test("opens with sound on and the console off unless asked, and answers the view under the page's id", async () => {
    const host = fakeHost(createDesktopExternalView(), answer);
    const result = await host.call("open", {
      id: "board",
      url: "https://cus.example/screen/1/2",
      allowOrigins: ["https://cus.example"],
      initScript: "window.__alive = Date.now()",
    });
    expect(result).toMatchObject({ ok: true, result: { id: "board", window: 1, restarts: 0 } });
    expect(host.shell[0]).toEqual({
      op: "externalView.open",
      args: {
        view: "board",
        url: "https://cus.example/screen/1/2",
        allowOrigins: ["https://cus.example"],
        initScript: "window.__alive = Date.now()",
        muted: false,
        autoplay: true,
        console: false,
        window: 1,
      },
    });
  });

  test("refuses a bad id, bounds or console level before the shell sees it", async () => {
    const host = fakeHost(createDesktopExternalView(), answer);
    const base = { url: "https://cus.example/", allowOrigins: ["https://cus.example"] };
    expect(await host.call("open", { id: "../x", ...base })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
    expect(await host.call("open", { id: "a", ...base, bounds: { x: 0, y: 0, width: 0, height: 1 } })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
    expect(await host.call("open", { id: "a", url: base.url, allowOrigins: [] })).toMatchObject({ ok: false });
    expect(() => consoleLevel("verbose")).toThrow("console must be");
    expect([consoleLevel(true), consoleLevel("info"), consoleLevel(false)]).toEqual(["warn", "info", null]);
    expect(host.shell).toEqual([]);
  });

  test("presses a key as the protocol's trusted keyDown with its text, then keyUp", async () => {
    const host = fakeHost(createDesktopExternalView(), answer);
    expect(await host.call("sendKey", { id: "board", key: "z", code: "KeyZ" })).toMatchObject({ ok: true });
    expect(host.shell.map((s) => s.args?.params)).toEqual([
      {
        type: "keyDown",
        key: "z",
        code: "KeyZ",
        windowsVirtualKeyCode: 90,
        nativeVirtualKeyCode: 90,
        text: "z",
        unmodifiedText: "z",
      },
      { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 },
    ]);
    expect([virtualKey("Digit1"), virtualKey("Space"), virtualKey("Slash"), virtualKey("F5")]).toEqual([
      49, 32, 191, 116,
    ]);
    expect(() => virtualKey("Hyper")).toThrow("not a key sendKey knows");
    for (const inherited of ["toString", "__proto__", "constructor", "hasOwnProperty"])
      expect(() => virtualKey(inherited)).toThrow("not a key sendKey knows");
  });

  test("a keyDown that times out on a busy page is still followed by its keyUp", async () => {
    const host = fakeHost(createDesktopExternalView(), (op, args) => {
      if ((args?.params as { type?: string } | undefined)?.type === "keyDown")
        throw new AkanNativeError("TIMEOUT", "externalView.cdp had no answer within 30 s");
      return answer(op);
    });
    expect(await host.call("sendKey", { id: "board", key: "z", code: "KeyZ" })).toMatchObject({
      ok: false,
      error: { code: "TIMEOUT" },
    });
    expect(host.shell.map((s) => (s.args?.params as { type?: string } | undefined)?.type)).toEqual([
      "keyDown",
      "keyUp",
    ]);
  });

  test("presses Enter with the text Chrome gives it, so a form submits and a focused button clicks", async () => {
    const host = fakeHost(createDesktopExternalView(), answer);
    await host.call("sendKey", { id: "board", key: "Enter", code: "Enter" });
    await host.call("sendKey", { id: "board", key: "Enter", code: "NumpadEnter" });
    await host.call("sendKey", { id: "board", key: "Escape", code: "Escape" });
    const downs = host.shell.map((s) => s.args?.params as Record<string, unknown>).filter((p) => p.type === "keyDown");
    expect(downs.map((p) => [p.code, p.windowsVirtualKeyCode, p.text, p.unmodifiedText])).toEqual([
      ["Enter", 13, "\r", "\r"],
      ["NumpadEnter", 13, "\r", "\r"],
      ["Escape", 27, undefined, undefined],
    ]);
  });

  test("captures the view as a PNG file with its size, and parses what evaluate answers", async () => {
    // A 3×2 PNG's signature and IHDR are enough for the size; the shell sends the engine's JSON as a string.
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(3, 16);
    png.writeUInt32BE(2, 20);
    const host = fakeHost(createDesktopExternalView(), (op, args) => {
      if (op === "externalView.cdp" && args?.method === "Page.captureScreenshot")
        return JSON.stringify({ data: png.toString("base64") });
      if (op === "externalView.evaluate") return JSON.stringify({ frozen: false });
      return null;
    });
    const shot = (await host.call("capture", { id: "board" })) as {
      ok: boolean;
      result: { width: number; height: number };
    };
    expect(shot).toMatchObject({ ok: true, result: { width: 3, height: 2 } });
    expect(await host.call("evaluate", { id: "board", script: "window.__state" })).toMatchObject({
      ok: true,
      result: { value: { frozen: false } },
    });
    expect(host.shell.map((s) => s.args?.method ?? s.op)).toEqual(["Page.captureScreenshot", "externalView.evaluate"]);
  });

  test("keeps one capture per view in the app's own temporary folder, and none from an earlier launch", async () => {
    const dir = join(tmpdir(), "dev.test", "external-view");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "board-1.png"), "");
    const png = Buffer.alloc(33);
    const host = fakeHost(createDesktopExternalView(), (op, args) =>
      op === "externalView.cdp" && args?.method === "Page.captureScreenshot"
        ? JSON.stringify({ data: png.toString("base64") })
        : null,
    );
    try {
      for (const id of ["board", "board", "menu"]) {
        expect(await host.call("capture", { id })).toMatchObject({ ok: true });
        await Bun.sleep(2);
      }
      const kept = readdirSync(dir);
      expect(kept).toHaveLength(2);
      expect(kept.filter((name) => name.startsWith("board-"))).toHaveLength(1);
      expect(kept).not.toContain("board-1.png");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("forwards loads, failures and the restart count to the view's window", async () => {
    const host = fakeHost(createDesktopExternalView(), answer);
    for (const event of ["load", "loadFailed", "gone"]) await host.call("$listen", { event });
    host.fire("externalView", {
      event: "load",
      view: "board",
      window: 1,
      state: "finished",
      url: "https://cus.example/a",
    });
    host.fire("externalView", {
      event: "loadFailed",
      view: "board",
      window: 1,
      url: "https://cus.example/a",
      errorCode: "hostNameNotResolved",
    });
    host.fire("externalView", { event: "gone", view: "board", window: 1, reason: "crashed", restarts: 3 });
    expect(host.emitted.map(({ event, data, windows }) => ({ event, data, windows }))).toEqual([
      { event: "load", data: { id: "board", state: "finished", url: "https://cus.example/a" }, windows: [1] },
      {
        event: "loadFailed",
        data: { id: "board", url: "https://cus.example/a", errorCode: "hostNameNotResolved" },
        windows: [1],
      },
      { event: "gone", data: { id: "board", reason: "crashed", restarts: 3 }, windows: [1] },
    ]);
  });

  test("passes the page's console from the level the view was opened with, with its source and line", async () => {
    const host = fakeHost(createDesktopExternalView(), answer);
    await host.call("open", { id: "board", url: opened.url, allowOrigins: ["https://cus.example"], console: true });
    await host.call("$listen", { event: "consoleMessage" });
    const cdp = (method: string, params: unknown) =>
      host.fire("externalView", { event: "cdp", view: "board", window: 1, method, params });
    cdp("Runtime.consoleAPICalled", { type: "log", args: [{ type: "string", value: "tick" }] });
    cdp("Runtime.consoleAPICalled", {
      type: "warning",
      args: [
        { type: "string", value: "slow frame" },
        { type: "number", value: 120 },
      ],
      stackTrace: { callFrames: [{ url: "https://cus.example/app.js", lineNumber: 41 }] },
    });
    cdp("Runtime.exceptionThrown", {
      exceptionDetails: {
        text: "Uncaught",
        url: "https://cus.example/app.js",
        lineNumber: 9,
        exception: { description: "TypeError: x is undefined" },
      },
    });
    expect(host.emitted.map((e) => e.data)).toEqual([
      { id: "board", level: "warn", text: "slow frame 120", url: "https://cus.example/app.js", line: 42 },
      { id: "board", level: "error", text: "TypeError: x is undefined", url: "https://cus.example/app.js", line: 10 },
    ]);
  });

  test("caps a noisy page's console and says how many it left out", () => {
    let now = 0;
    const cap = createConsoleCap(() => now);
    const passed = Array.from({ length: CONSOLE_BURST + 5 }, () => cap("board").pass);
    expect(passed.filter(Boolean)).toHaveLength(CONSOLE_BURST);
    now += 10_000;
    expect(cap("board")).toEqual({ pass: true, dropped: 5 });
    expect(consoleMessageOf("Network.requestWillBeSent", {})).toBeNull();
  });
});

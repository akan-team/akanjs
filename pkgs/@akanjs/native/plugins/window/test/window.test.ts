import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import { createLifecycle } from "../../../packages/desktop/src/lifecycle.ts";
import desktop from "../src/desktop.ts";
import { appWindow, createWindow, getAllWindows, getCurrentWindow, onCloseRequested } from "../src/index.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

describe("window plugin routing", () => {
  test("mobile hosts do not provide it", async () => {
    host = installMockHost({ platform: "ios", plugins: {} });
    expect(appWindow.isSupported("setTitle")).toBe(false);
    expect(await appWindow.minimize().catch((e) => e.code)).toBe("UNSUPPORTED");
  });

  test("the desktop host gets the calls", async () => {
    host = installMockHost({
      platform: "macos",
      plugins: { window: { methods: { setTitle: ({ title }: { title: string }) => ({ title }) } } },
    });
    expect(await appWindow.setTitle({ title: "x" })).toMatchObject({ title: "x" });
  });
});

describe("window desktop implementation", () => {
  const shellCalls: { op: string; args?: Record<string, unknown> }[] = [];
  const listeners = new Map<string, (e: any) => void>();
  const dispatcher = createDispatcher([desktop], {
    app: { id: "dev.test", name: "Test", version: "1.0.0" },
    appDataDir: join(mkdtempSync(join(tmpdir(), "akan-native-window-")), "data"),
    emit: (_window, { plugin, event, data }) => emitted.push({ plugin, event, data }),
    registerFile: () => ({ url: "", mime: "", size: 0 }),
    shell: async (op, args) => {
      shellCalls.push({ op, args });
      return { title: "t", width: 1, height: 1 };
    },
    onNativeEvent: (type, listener) => {
      listeners.set(type, listener);
      return () => listeners.delete(type);
    },
  });
  const emitted: unknown[] = [];
  const call = (method: string, args?: unknown) =>
    dispatcher.handle(JSON.stringify({ v: 1, id: 1, plugin: "window", method, args }));

  test("maps methods to shell ops and validates arguments", async () => {
    await call("setSize", { width: 800, height: 600 });
    await call("setFullscreen", { value: true });
    // Method calls act on the calling window (SH-6); dispatcher.handle defaults to window 1.
    expect(shellCalls).toEqual([
      { op: "window.setSize", args: { width: 800, height: 600, window: 1 } },
      { op: "window.setFullscreen", args: { value: true, window: 1 } },
    ]);
    expect(await call("setSize", { width: -1, height: 1 })).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGS" },
    });
    expect(await call("setTitle", { title: 3 })).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
  });

  test("turns native window events into plugin events", async () => {
    await call("$listen", { event: "resize" });
    listeners.get("window")!({ type: "window", event: "resized", width: 640, height: 480 });
    listeners.get("window")!({ type: "window", event: "moved", x: 1, y: 2 });
    expect(emitted).toEqual([{ plugin: "window", event: "resize", data: { width: 640, height: 480 } }]);
  });

  test("file drags become dragDrop events; dropped regular files become FileRefs (D9)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-drop-"));
    const file = join(dir, "photo one.PNG");
    writeFileSync(file, "x");
    emitted.length = 0;
    await call("$listen", { event: "dragDrop" });
    const fire = (e: Record<string, unknown>) => listeners.get("dragDrop")!({ type: "dragDrop", window: 1, ...e });
    fire({ event: "enter", paths: [file, dir], x: 10, y: 20 });
    fire({ event: "over", x: 11, y: 21 });
    fire({ event: "drop", paths: [file, dir, join(dir, "gone.txt")], x: 12, y: 22 });
    fire({ event: "leave" });
    expect(emitted.map((e) => (e as { data: unknown }).data)).toEqual([
      { type: "enter", paths: [file, dir], position: { x: 10, y: 20 } },
      { type: "over", position: { x: 11, y: 21 } },
      {
        type: "drop",
        paths: [file, dir, join(dir, "gone.txt")],
        position: { x: 12, y: 22 },
        // The folder and the missing file are left out; the MIME type comes from the extension.
        files: [{ url: "", mime: "", size: 0, path: file, name: "photo one.PNG" }],
      },
      { type: "leave" },
    ]);
  });
});

describe("close requests (plugins.md D4)", () => {
  test("page: handlers run in order, the host hears 'received' and then the decision", async () => {
    host = installMockHost({
      platform: "macos",
      plugins: { window: { methods: { answerCloseRequested: () => undefined }, events: ["closeRequested"] } },
    });
    const seen: string[] = [];
    const stopA = onCloseRequested(async (event) => {
      await Bun.sleep(1);
      seen.push("a");
      event.preventDefault();
    });
    const stopB = onCloseRequested((event) => void seen.push(`b ${event.defaultPrevented}`));
    await Bun.sleep(1);
    expect(host.subscriptions("window", "closeRequested")).toBe(1);
    host.emit("window", "closeRequested", { id: 7 });
    await Bun.sleep(10);
    expect(seen).toEqual(["a", "b true"]);
    const answers = host.requests.filter((r) => r.method === "answerCloseRequested").map((r) => r.args);
    expect(answers).toEqual([{ id: 7 }, { id: 7, allow: false }]);
    stopA();
    stopB();
    await Bun.sleep(1);
    expect(host.subscriptions("window", "closeRequested")).toBe(0);
  });

  test("page: a throwing handler does not keep the window open; mobile never subscribes", async () => {
    host = installMockHost({
      platform: "macos",
      plugins: { window: { methods: { answerCloseRequested: () => undefined }, events: ["closeRequested"] } },
    });
    const stop = onCloseRequested(() => {
      throw new Error("broken");
    });
    await Bun.sleep(1);
    host.emit("window", "closeRequested", { id: 1 });
    await Bun.sleep(5);
    expect(host.requests.filter((r) => r.method === "answerCloseRequested").at(-1)?.args).toEqual({
      id: 1,
      allow: true,
    });
    stop();
    await Bun.sleep(1); // let the deferred $unlisten reach the mock host
    host.uninstall();

    host = installMockHost({ platform: "ios", plugins: {} });
    const noop = onCloseRequested(() => {});
    expect(appWindow.eventImplementation("closeRequested")).toBe("none");
    expect(appWindow.isSupported("answerCloseRequested")).toBe(false);
    noop();
  });

  test("desktop: the close button asks the page; close() quits without asking", async () => {
    const exits: number[] = [];
    const emitted: { event: string; data: any }[] = [];
    const lifecycle = createLifecycle({
      quitOnLastWindowClosed: true,
      exit: (code) => void exits.push(code),
      cancelSessionEnd: () => {},
      hideWindow: async () => {},
    });
    const dispatcher = createDispatcher([desktop], {
      app: { id: "dev.test", name: "Test", version: "1.0.0" },
      appDataDir: join(mkdtempSync(join(tmpdir(), "akan-native-window-")), "data"),
      emit: (_window, { event, data }) => void emitted.push({ event, data }),
      registerFile: () => ({ url: "", mime: "", size: 0 }),
      lifecycle,
    });
    const call = (method: string, args?: unknown) =>
      dispatcher.handle(JSON.stringify({ v: 1, id: 1, plugin: "window", method, args }));

    await call("$listen", { event: "closeRequested" });
    const first = lifecycle.closeRequested();
    expect(emitted).toEqual([{ event: "closeRequested", data: { id: 1 } }]);
    expect(await call("answerCloseRequested", { id: 1, allow: false })).toMatchObject({ ok: true });
    await first;
    expect(exits).toEqual([]);

    const second = lifecycle.closeRequested();
    await call("answerCloseRequested", { id: 2, allow: true });
    await second;
    await Bun.sleep(5);
    expect(exits).toEqual([0]);
    await call("$unlisten", { event: "closeRequested" });
  });

  test("desktop: close() closes without the page, and hides with quitOnLastWindowClosed: false", async () => {
    const log: string[] = [];
    const lifecycle = createLifecycle({
      quitOnLastWindowClosed: false,
      exit: () => void log.push("exit"),
      cancelSessionEnd: () => {},
      hideWindow: async () => void log.push("hide"),
    });
    const dispatcher = createDispatcher([desktop], {
      app: { id: "dev.test", name: "Test", version: "1.0.0" },
      appDataDir: join(mkdtempSync(join(tmpdir(), "akan-native-window-")), "data"),
      emit: () => {},
      registerFile: () => ({ url: "", mime: "", size: 0 }),
      lifecycle,
    });
    await dispatcher.handle(
      JSON.stringify({ v: 1, id: 1, plugin: "window", method: "$listen", args: { event: "closeRequested" } }),
    );
    expect(await dispatcher.handle(JSON.stringify({ v: 1, id: 2, plugin: "window", method: "close" }))).toMatchObject({
      ok: true,
    });
    await Bun.sleep(80);
    expect(log).toEqual(["hide"]);
  });
});

describe("windows (SH-6)", () => {
  test("handles target their window; createWindow and getAllWindows go through the host", async () => {
    const calls: { method: string; args: unknown }[] = [];
    const record =
      (method: string, result: unknown = { title: "t" }) =>
      (args: unknown) => (calls.push({ method, args }), result);
    host = installMockHost({
      platform: "macos",
      plugins: {
        window: {
          methods: {
            create: record("create", { id: 2 }),
            list: record("list", [{ id: 1 }, { id: 2 }]),
            setTitle: record("setTitle"),
            close: record("close", null),
          },
          events: ["destroyed"],
        },
      },
    });
    const child = await createWindow({ path: "/settings", width: 400, height: 300 });
    expect(child.id).toBe(2);
    expect(child.isCurrent).toBe(false);
    await child.setTitle("Settings");
    await child.close();
    expect((await getAllWindows()).map((w) => w.id)).toEqual([1, 2]);
    expect(getCurrentWindow()).toMatchObject({ id: 1, isCurrent: true });
    expect(calls).toEqual([
      { method: "create", args: { path: "/settings", width: 400, height: 300 } },
      { method: "setTitle", args: { title: "Settings", window: 2 } },
      { method: "close", args: { window: 2 } },
      { method: "list", args: undefined },
    ]);
    let gone = 0;
    child.onDestroyed(() => gone++);
    await Bun.sleep(1); // $listen reaches the host
    host.emit("window", "destroyed", { id: 3 });
    host.emit("window", "destroyed", { id: 2 });
    host.emit("window", "destroyed", { id: 2 }); // once
    expect(gone).toBe(1);
  });

  test("one window where the host cannot open more", async () => {
    host = installMockHost({ platform: "web" });
    expect((await getAllWindows()).map((w) => w.id)).toEqual([1]);
    expect(
      await createWindow().then(
        () => "created",
        (e) => e.code,
      ),
    ).toBe("UNSUPPORTED");
  });
});

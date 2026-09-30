import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import { createLifecycle } from "../../../packages/desktop/src/lifecycle.ts";
import { createServerStatus } from "../../../packages/desktop/src/server.ts";
import manifest from "../native-plugin.json";
import desktop from "../src/desktop.ts";
import { app, onBeforeQuit } from "../src/index.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

describe("app plugin routing", () => {
  test("native methods and events", async () => {
    host = installMockHost({
      platform: "android",
      plugins: { app: { methods: { getLaunchUrl: () => ({ url: "akansample://x" }) }, events: ["backButton"] } },
    });
    expect(await app.getLaunchUrl()).toEqual({ url: "akansample://x" });
    const seen: boolean[] = [];
    const stop = app.listen("backButton", ({ canGoBack }) => seen.push(canGoBack));
    await Bun.sleep(1);
    host.emit("app", "backButton", { canGoBack: true });
    expect(seen).toEqual([true]);
    stop();
  });

  test("web: getInfo from the boot data, exit unsupported", async () => {
    host = installMockHost({ platform: "web" });
    expect(app.isSupported("exit")).toBe(false);
    expect(await app.getLaunchUrl()).toEqual({ url: null });
  });
});

describe("app desktop implementation", () => {
  test("keeps the launch URL and buffers links until the page listens", async () => {
    let opened: ((e: any) => void) | undefined;
    const emitted: unknown[] = [];
    const dispatcher = createDispatcher([desktop], {
      app: { id: "dev.test", name: "Test", version: "1.2.3", build: 4 },
      appDataDir: join(mkdtempSync(join(tmpdir(), "akan-native-app-")), "data"),
      emit: (_window, { plugin, event, data }) => emitted.push({ plugin, event, data }),
      registerFile: () => ({ url: "", mime: "", size: 0 }),
      onNativeEvent: (type, listener) => {
        if (type === "opened") opened = listener;
        return () => {};
      },
    });
    const call = (method: string, args?: unknown) =>
      dispatcher.handle(JSON.stringify({ v: 1, id: 1, plugin: "app", method, args }));
    opened!({ type: "opened", urls: ["akansample://launch"] });
    opened!({ type: "opened", urls: ["akansample://second"] });
    expect(await call("getInfo")).toMatchObject({ result: { id: "dev.test", version: "1.2.3", build: 4 } });
    expect(await call("getLaunchUrl")).toMatchObject({ result: { url: "akansample://launch" } });
    await call("$listen", { event: "urlOpen" });
    expect(emitted).toEqual([
      { plugin: "app", event: "urlOpen", data: { url: "akansample://launch" } },
      { plugin: "app", event: "urlOpen", data: { url: "akansample://second" } },
    ]);
    opened!({ type: "opened", urls: ["akansample://third"] });
    expect(emitted).toHaveLength(3);
  });
});

describe("serverState (desktop)", () => {
  test("tells the page where the carried server is when it listens, then every change", async () => {
    const { status, setState } = createServerStatus();
    const emitted: unknown[] = [];
    const dispatcher = createDispatcher([desktop], {
      app: { id: "dev.test", name: "Test", version: "1.2.3", build: 4 },
      appDataDir: join(mkdtempSync(join(tmpdir(), "akan-native-app-")), "data"),
      server: status,
      emit: (_window, { event, data }) => emitted.push({ event, data }),
      registerFile: () => ({ url: "", mime: "", size: 0 }),
    });
    await dispatcher.launched;
    await dispatcher.handle(
      JSON.stringify({ v: 1, id: 1, plugin: "app", method: "$listen", args: { event: "serverState" } }),
    );
    setState("up");
    setState("restarting");
    expect(emitted).toEqual([
      { event: "serverState", data: { state: "starting" } },
      { event: "serverState", data: { state: "up" } },
      { event: "serverState", data: { state: "restarting" } },
    ]);
  });
});

describe("beforeQuit (plugins.md D4)", () => {
  test("declared on macOS only", () => {
    const plugin = { spec: "app", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "macos").app).toMatchObject({
      events: ["urlOpen", "backButton", "beforeQuit", "backProgress", "serverState"],
    });
    for (const [platform, events] of [
      ["ios", ["urlOpen", "backButton"]],
      ["android", ["urlOpen", "backButton", "backProgress"]],
    ] as const) {
      const decl = pluginDecls([plugin], platform).app as { methods: string[]; events: string[] };
      expect(decl.events).toEqual([...events]);
      expect(decl.methods).not.toContain("answerBeforeQuit");
    }
  });

  test("page: the reason reaches the handlers, preventDefault keeps the app", async () => {
    host = installMockHost({
      platform: "macos",
      plugins: { app: { methods: { answerBeforeQuit: () => undefined }, events: ["beforeQuit"] } },
    });
    const reasons: string[] = [];
    const stop = onBeforeQuit((event) => {
      reasons.push(event.reason);
      if (event.reason === "session") event.preventDefault();
    });
    await Bun.sleep(1);
    host.emit("app", "beforeQuit", { id: 1, reason: "user" });
    host.emit("app", "beforeQuit", { id: 2, reason: "session" });
    await Bun.sleep(5);
    expect(reasons).toEqual(["user", "session"]);
    const decisions = host.requests.filter(
      (r) => r.method === "answerBeforeQuit" && (r.args as { allow?: boolean }).allow !== undefined,
    );
    expect(decisions.map((r) => r.args)).toEqual([
      { id: 1, allow: true },
      { id: 2, allow: false },
    ]);
    stop();
    await Bun.sleep(1);
  });

  test("desktop: a logout asks the page and is cancelled when prevented; exit() quits after the quit hooks without asking", async () => {
    const log: string[] = [];
    const emitted: { event: string; data: any }[] = [];
    const lifecycle = createLifecycle({
      quitOnLastWindowClosed: true,
      exit: (code) => void log.push(`exit ${code}`),
      cancelSessionEnd: () => void log.push("cancel session"),
      hideWindow: async () => {},
    });
    lifecycle.onQuit(() => void log.push("hook"));
    const dispatcher = createDispatcher([desktop], {
      app: { id: "dev.test", name: "Test", version: "1.0.0" },
      appDataDir: join(mkdtempSync(join(tmpdir(), "akan-native-app-")), "data"),
      emit: (_window, { event, data }) => void emitted.push({ event, data }),
      registerFile: () => ({ url: "", mime: "", size: 0 }),
      lifecycle,
    });
    const call = (method: string, args?: unknown) =>
      dispatcher.handle(JSON.stringify({ v: 1, id: 1, plugin: "app", method, args }));

    await call("$listen", { event: "beforeQuit" });
    const session = lifecycle.requestQuit("session");
    expect(emitted).toEqual([{ event: "beforeQuit", data: { reason: "session", id: 1 } }]);
    await call("answerBeforeQuit", { id: 1 });
    await call("answerBeforeQuit", { id: 1, allow: false });
    expect(await session).toBe(false);
    expect(log).toEqual(["cancel session"]);

    await call("exit");
    await Bun.sleep(80);
    expect(log).toEqual(["cancel session", "hook", "exit 0"]);
    expect(emitted).toHaveLength(1); // exit() did not ask the page
    await call("$unlisten", { event: "beforeQuit" });
  });
});

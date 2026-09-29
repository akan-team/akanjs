import { describe, expect, test } from "bun:test";
import { HMR_CLIENT_SCRIPT } from "./clientScript";

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  textContent = "";
  className = "";
  #label: FakeElement | null = null;
  #detail: FakeElement | null = null;

  constructor(readonly tagName: string) {}

  set innerHTML(value: string) {
    this.children.length = 0;
    if (!value.includes("data-akan-hmr-label")) return;
    const label = new FakeElement("span");
    const detail = new FakeElement("span");
    label.textContent = "Updating...";
    this.#label = label;
    this.#detail = detail;
    this.appendChild(label);
    this.appendChild(detail);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeElement): FakeElement {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "[data-akan-hmr-label]") return this.#label;
    if (selector === "[data-akan-hmr-detail]") return this.#detail;
    return null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }
}

const createHmrHarness = ({
  selfOverrides = {},
  runTimers = false,
  onTimer,
}: {
  selfOverrides?: Record<string, unknown>;
  runTimers?: boolean;
  onTimer?: (callback: () => void, delay: number) => void;
} = {}) => {
  const sockets: FakeWebSocket[] = [];
  const document = {
    body: new FakeElement("body"),
    documentElement: new FakeElement("html"),
    head: new FakeElement("head"),
    createElement: (tagName: string) => new FakeElement(tagName),
    querySelectorAll: () => [],
  };
  let reloadCount = 0;
  const location = {
    protocol: "http:",
    host: "localhost:3000",
    href: "http://localhost:3000/",
    pathname: "/",
    reload: () => {
      reloadCount += 1;
    },
  };
  const self = {
    __AKAN_RSC_CLEAR_CACHE__: () => undefined,
    __AKAN_RSC_REFRESH__: () => Promise.resolve(),
    ...selfOverrides,
  };
  class FakeWebSocket {
    readonly listeners = new Map<string, ((event?: { data: string }) => void)[]>();

    constructor(readonly url: string) {
      sockets.push(this);
    }

    addEventListener(type: string, listener: (event?: { data: string }) => void): void {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    close(): void {
      for (const listener of this.listeners.get("close") ?? []) listener();
    }

    sendMessage(message: unknown): void {
      const event = { data: JSON.stringify(message) };
      for (const listener of this.listeners.get("message") ?? []) listener(event);
    }
  }

  const run = new Function(
    "self",
    "location",
    "WebSocket",
    "document",
    "setTimeout",
    "clearTimeout",
    "requestAnimationFrame",
    "performance",
    "console",
    HMR_CLIENT_SCRIPT,
  );
  run(
    self,
    location,
    FakeWebSocket,
    document,
    (callback: () => void, delay: number) => {
      onTimer?.(callback, delay);
      if (runTimers) callback();
      return 1;
    },
    () => undefined,
    (callback: () => void) => callback(),
    { now: () => 0 },
    { debug: () => undefined, error: () => undefined, warn: () => undefined },
  );

  const overlay = () => document.body.children[0];
  const label = () => overlay()?.querySelector("[data-akan-hmr-label]")?.textContent;
  const detail = () => overlay()?.querySelector("[data-akan-hmr-detail]")?.textContent;

  return {
    ws: sockets[0],
    sockets,
    overlay,
    label,
    detail,
    get reloadCount() {
      return reloadCount;
    },
  };
};

describe("HMR_CLIENT_SCRIPT", () => {
  test("routes incremental refresh messages without forcing a document reload", () => {
    expect(HMR_CLIENT_SCRIPT).toContain('if (msg.type === "rsc-refresh") {\n        refreshRsc(msg);');
    expect(HMR_CLIENT_SCRIPT).toContain('if (msg.type === "ssr-update") {\n        applySsrUpdate(msg);');
    expect(HMR_CLIENT_SCRIPT).not.toContain("client-refresh");
    expect(HMR_CLIENT_SCRIPT).toContain('if (msg.type === "build-status") { handleBuildStatus(msg); return; }');
    expect(HMR_CLIENT_SCRIPT).toContain("pendingRefreshRegistrations.push([type, id]);");
    expect(HMR_CLIENT_SCRIPT).toContain("React Refresh runtime preload failed");
    expect(HMR_CLIENT_SCRIPT).toContain("pendingRefreshRegistrations = [];");
    expect(HMR_CLIENT_SCRIPT).not.toContain("function reloadForHmr");
  });

  test("keeps build failures visible until a recovered status arrives", () => {
    expect(HMR_CLIENT_SCRIPT).toContain("var buildErrorStates = {};");
    expect(HMR_CLIENT_SCRIPT).toContain('el.setAttribute("data-status", "error");');
    expect(HMR_CLIENT_SCRIPT).toContain('if (msg.status === "ok") clearBuildErrorOverlay(msg);');
    expect(HMR_CLIENT_SCRIPT).toContain('overlayLabelEl.textContent = "Build recovered";');
  });

  test("tracks build failures by phase and clears only recovered phases", () => {
    const hmr = createHmrHarness();

    hmr.ws.sendMessage({
      type: "build-status",
      status: "error",
      generation: 10,
      phase: "pages",
      message: "Pages failed",
      files: 1,
    });
    hmr.ws.sendMessage({
      type: "build-status",
      status: "error",
      generation: 11,
      phase: "css",
      message: "CSS failed",
      files: 2,
    });

    expect(hmr.overlay().getAttribute("data-status")).toBe("error");
    expect(hmr.label()).toBe("Build failed: css, pages");
    expect(hmr.detail()).toContain("2 failed phases");
    expect(hmr.detail()).toContain("CSS failed");

    hmr.ws.sendMessage({ type: "build-status", status: "ok", generation: 12, phase: "css", files: 0 });

    expect(hmr.overlay().getAttribute("data-status")).toBe("error");
    expect(hmr.label()).toBe("Build failed: pages");
    expect(hmr.detail()).toContain("Pages failed");

    hmr.ws.sendMessage({ type: "build-status", status: "ok", generation: 10, phase: "pages", files: 0 });

    expect(hmr.overlay().getAttribute("data-status")).toBe("error");
    expect(hmr.label()).toBe("Build failed: pages");

    hmr.ws.sendMessage({ type: "build-status", status: "ok", generation: 11, phase: "pages", files: 0 });

    expect(hmr.overlay().getAttribute("data-status")).toBe("ok");
    expect(hmr.label()).toBe("Build recovered");
    expect(hmr.reloadCount).toBe(0);
  });

  test("a route built again at its failure's generation clears the overlay", () => {
    const hmr = createHmrHarness();
    hmr.ws.sendMessage({ type: "build-status", status: "error", generation: 4, phase: "route", message: "x" });
    expect(hmr.label()).toBe("Build failed: route");
    hmr.ws.sendMessage({ type: "build-status", status: "ok", generation: 4, phase: "route", files: 0 });
    expect(hmr.overlay().getAttribute("data-status")).toBe("ok");
  });

  test("a hello naming the phases failing now drops an error the tab holds for any other", () => {
    const hmr = createHmrHarness();
    for (const [phase, generation] of [
      ["route", 37],
      ["ssr", 5],
    ] as const)
      hmr.ws.sendMessage({ type: "build-status", status: "error", generation, phase, message: `${phase} failed` });
    expect(hmr.label()).toBe("Build failed: route, ssr");

    hmr.ws.sendMessage({ type: "hello", buildId: 1, failingPhases: ["ssr"] });
    expect(hmr.label()).toBe("Build failed: ssr");

    hmr.ws.sendMessage({ type: "hello", buildId: 1, failingPhases: [] });
    expect(hmr.overlay().getAttribute("data-status")).toBe("ok");
    expect(hmr.reloadCount).toBe(0);
  });

  test("keeps error label when an HMR overlay job finishes during a build error", async () => {
    const hmr = createHmrHarness();

    hmr.ws.sendMessage({
      type: "build-status",
      status: "error",
      generation: 10,
      phase: "pages",
      message: "Pages failed",
      files: 1,
    });
    hmr.ws.sendMessage({ type: "rsc-refresh", buildId: 1, generation: 10 });
    await Promise.resolve();
    await Promise.resolve();

    expect(hmr.overlay().getAttribute("data-status")).toBe("error");
    expect(hmr.label()).toBe("Build failed: pages");
    expect(hmr.detail()).toContain("Pages failed");
  });

  test("a CSR page connects as a CSR client and reloads when hello names another generation", () => {
    const hmr = createHmrHarness({
      selfOverrides: { __AKAN_HMR_CLIENT__: "csr", __AKAN_CSR_GENERATION__: 4 },
      runTimers: true,
    });

    expect(hmr.ws.url).toBe("ws://localhost:3000/_akan/hmr?client=csr");
    hmr.ws.sendMessage({ type: "hello", buildId: 1, csrGeneration: 4 });
    hmr.ws.sendMessage({ type: "hello", buildId: 2, csrGeneration: 4 });
    expect(hmr.reloadCount).toBe(0);

    hmr.ws.sendMessage({ type: "hello", buildId: 2, csrGeneration: 5 });
    expect(hmr.reloadCount).toBe(1);
  });

  test("a registry CSR page hands csr-update to its runtime, while an artifact page reloads", () => {
    const received: unknown[] = [];
    const registry = createHmrHarness({
      selfOverrides: {
        __AKAN_HMR_CLIENT__: "csr",
        __akan: { generation: 1, hot: (msg: unknown) => received.push(msg) },
      },
      runTimers: true,
    });
    const update = { type: "csr-update", generation: 2, url: "/_akan/csr-dev/patch-2.js" };
    registry.ws.sendMessage(update);
    expect(received).toEqual([update]);
    expect(registry.reloadCount).toBe(0);

    const artifact = createHmrHarness({ selfOverrides: { __AKAN_HMR_CLIENT__: "csr" }, runTimers: true });
    artifact.ws.sendMessage({ type: "csr-update", generation: 1_700_000_000_000, reload: true });
    expect(artifact.reloadCount).toBe(1);
  });

  test("an SSR tab catches up on reconnect when its registry is behind, and reloads onto another epoch", () => {
    const registry = (generation: number, target = generation) => {
      const caughtUp: [number, string][] = [];
      return {
        generation,
        caughtUp,
        hot: () => undefined,
        catchUp: (to: number, prefix: string) => caughtUp.push([to, prefix]),
        inspect: () => ({ generation, target, started: true, failed: false }),
      };
    };
    const behindRegistry = registry(3);
    const behind = createHmrHarness({
      selfOverrides: { __akan: behindRegistry, __AKAN_SSR_EPOCH__: 100 },
      runTimers: true,
    });
    behind.ws?.sendMessage({ type: "hello", buildId: 1, ssrGeneration: 5, ssrEpoch: 100 });
    expect(behind.reloadCount).toBe(0);
    expect(behindRegistry.caughtUp).toEqual([[5, "/_akan/ssr-dev/"]]);

    const loadingRegistry = registry(3, 5);
    createHmrHarness({
      selfOverrides: { __akan: loadingRegistry, __AKAN_SSR_EPOCH__: 100 },
      runTimers: true,
    }).ws?.sendMessage({ type: "hello", buildId: 1, ssrGeneration: 5, ssrEpoch: 100 });
    expect(loadingRegistry.caughtUp).toEqual([]);

    const aheadRegistry = registry(6);
    const ahead = createHmrHarness({
      selfOverrides: { __akan: aheadRegistry, __AKAN_SSR_EPOCH__: 100 },
      runTimers: true,
    });
    ahead.ws?.sendMessage({ type: "hello", buildId: 1, ssrGeneration: 5, ssrEpoch: 100 });
    expect(ahead.reloadCount).toBe(0);
    expect(aheadRegistry.caughtUp).toEqual([]);

    const unnamedRegistry = registry(3);
    createHmrHarness({
      selfOverrides: { __akan: unnamedRegistry, __AKAN_SSR_EPOCH__: 100 },
      runTimers: true,
    }).ws?.sendMessage({ type: "hello", buildId: 1, ssrGeneration: 5 });
    expect(unnamedRegistry.caughtUp).toEqual([]);

    const replaced = createHmrHarness({
      selfOverrides: { __akan: registry(6), __AKAN_SSR_EPOCH__: 100 },
      runTimers: true,
    });
    replaced.ws?.sendMessage({ type: "hello", buildId: 1, ssrGeneration: 6, ssrEpoch: 200 });
    expect(replaced.reloadCount).toBe(1);
  });

  test("an SSR tab that reconnects to the same build stays, and to a newer one of its registry refetches its payload", async () => {
    const refreshed: unknown[] = [];
    const harness = createHmrHarness({
      selfOverrides: {
        __AKAN_SSR_EPOCH__: 5,
        __AKAN_RSC_REFRESH__: (options: unknown) => {
          refreshed.push(options);
          return Promise.resolve();
        },
      },
      runTimers: true,
    });
    harness.ws?.sendMessage({ type: "hello", buildId: 7, ssrEpoch: 5 });
    harness.ws?.sendMessage({ type: "hello", buildId: 7, ssrEpoch: 5 });
    expect(refreshed).toEqual([]);
    harness.ws?.sendMessage({ type: "hello", buildId: 8, ssrEpoch: 5 });
    await Promise.resolve();
    expect(refreshed).toEqual([{ buildId: 8 }]);
    expect(harness.reloadCount).toBe(0);

    const systemPage = createHmrHarness({ selfOverrides: { __AKAN_HMR_SYSTEM_PAGE__: true }, runTimers: true });
    systemPage.ws?.sendMessage({ type: "hello", buildId: 7 });
    systemPage.ws?.sendMessage({ type: "hello", buildId: 8 });
    expect(systemPage.reloadCount).toBe(1);
  });

  test("a tab holding a registry reloads when the dev server has none, as after a new session or a config restart", () => {
    // Every backend starts at build id 0, so the build id alone cannot tell a restart that cleared .akan.
    const gone = createHmrHarness({ selfOverrides: { __AKAN_SSR_EPOCH__: 5 }, runTimers: true });
    gone.ws?.sendMessage({ type: "hello", buildId: 0, ssrEpoch: 5 });
    expect(gone.reloadCount).toBe(0);
    gone.ws?.sendMessage({ type: "hello", buildId: 0 });
    expect(gone.reloadCount).toBe(1);

    const neverBooted = createHmrHarness({ runTimers: true });
    neverBooted.ws?.sendMessage({ type: "hello", buildId: 0 });
    neverBooted.ws?.sendMessage({ type: "hello", buildId: 0 });
    expect(neverBooted.reloadCount).toBe(0);
    neverBooted.ws?.sendMessage({ type: "hello", buildId: 8 });
    expect(neverBooted.reloadCount).toBe(1);
  });

  test("a tab whose registry failed to boot reloads once a newer registry exists, and only then", () => {
    const failed = { __AKAN_SSR_BOOT_FAILED__: { generation: 4, epoch: 10 } };
    const hello = createHmrHarness({ selfOverrides: failed, runTimers: true });
    hello.ws?.sendMessage({ type: "hello", buildId: 1, ssrGeneration: 4, ssrEpoch: 10 });
    expect(hello.reloadCount).toBe(0);
    hello.ws?.sendMessage({ type: "hello", buildId: 1, ssrGeneration: 5, ssrEpoch: 10 });
    expect(hello.reloadCount).toBe(1);

    const rebuilt = createHmrHarness({ selfOverrides: failed, runTimers: true });
    rebuilt.ws?.sendMessage({ type: "hello", buildId: 1, ssrGeneration: 4, ssrEpoch: 11 });
    expect(rebuilt.reloadCount).toBe(1);

    const patched = createHmrHarness({ selfOverrides: failed, runTimers: true });
    patched.ws?.sendMessage({ type: "ssr-update", generation: 5, url: "/_akan/ssr-dev/patch-5.js" });
    expect(patched.reloadCount).toBe(1);
  });

  test("a registry that failed to start reloads on a reload of its own generation, and one that started does not", () => {
    for (const failed of [true, false]) {
      const hot: unknown[] = [];
      const registry = {
        generation: 5,
        hot: (message: unknown) => hot.push(message),
        inspect: () => ({ generation: 5, target: 5, started: true, failed }),
      };
      const harness = createHmrHarness({ selfOverrides: { __akan: registry }, runTimers: true });
      harness.ws?.sendMessage({ type: "ssr-update", generation: 5, reload: true, reason: "an npm module joined" });
      expect(harness.reloadCount).toBe(failed ? 1 : 0);
    }
  });

  test("an RSC refresh waits for a registry still booting, whose start replays the updates that came first", async () => {
    let booted = (): void => undefined;
    const boot = new Promise<void>((resolve) => {
      booted = resolve;
    });
    const refreshes: unknown[] = [];
    const harness = createHmrHarness({
      selfOverrides: {
        __AKAN_SSR_BOOT__: boot,
        __AKAN_RSC_REFRESH__: (input: unknown) => {
          refreshes.push(input);
          return Promise.resolve();
        },
      },
    });
    harness.ws?.sendMessage({ type: "rsc-refresh", buildId: 2, generation: 6 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshes).toEqual([]);
    booted();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshes).toEqual([{ buildId: 2 }]);
  });

  test("an RSC refresh overtaken while it waits for the registry leaves the refresh to the newer one", async () => {
    let settle = (): void => undefined;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const refreshes: unknown[] = [];
    const harness = createHmrHarness({
      selfOverrides: {
        __akan: { generation: 5, whenSettled: () => settled },
        __AKAN_RSC_REFRESH__: (input: unknown) => {
          refreshes.push(input);
          return Promise.resolve();
        },
      },
    });
    harness.ws?.sendMessage({ type: "rsc-refresh", buildId: 3, generation: 7 });
    harness.ws?.sendMessage({ type: "rsc-refresh", buildId: 4, generation: 8 });
    settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshes).toEqual([{ buildId: 4 }]);
  });

  test("an RSC refresh still runs when the registry's boot failed, though its updates never replay", async () => {
    const boot = Promise.reject(new Error("app.js failed to load"));
    boot.catch(() => undefined);
    const refreshes: unknown[] = [];
    const harness = createHmrHarness({
      selfOverrides: {
        __AKAN_SSR_BOOT__: boot,
        __akan: { generation: 5, whenSettled: () => new Promise(() => undefined) },
        __AKAN_RSC_REFRESH__: (input: unknown) => {
          refreshes.push(input);
          return Promise.resolve();
        },
      },
    });
    harness.ws?.sendMessage({ type: "rsc-refresh", buildId: 3, generation: 7 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refreshes).toEqual([{ buildId: 3 }]);
  });

  test("an SSR registry reload reloads the tab itself, even when its runtime never started", () => {
    const hot: unknown[] = [];
    const harness = createHmrHarness({
      selfOverrides: { __akan: { generation: 0, hot: (message: unknown) => hot.push(message) } },
      runTimers: true,
    });
    harness.ws?.sendMessage({
      type: "ssr-update",
      generation: 4,
      reload: true,
      reason: "an npm module joined the graph",
    });
    expect(harness.reloadCount).toBe(1);
    expect(hot).toEqual([]);
  });

  test("the dev error page reloads on a client patch or a recovered build, and preloads no refresh runtime", () => {
    const patched = createHmrHarness({ selfOverrides: { __AKAN_HMR_SYSTEM_PAGE__: true }, runTimers: true });
    patched.ws?.sendMessage({ type: "ssr-update", generation: 3, url: "/_akan/ssr-dev/patch-3.js" });
    expect(patched.reloadCount).toBe(1);

    const recovered = createHmrHarness({ selfOverrides: { __AKAN_HMR_SYSTEM_PAGE__: true }, runTimers: true });
    recovered.ws?.sendMessage({ type: "build-status", status: "ok", generation: 4, phase: "pages" });
    expect(recovered.reloadCount).toBe(1);

    //? Fixed while its socket was down: the hello that follows names no failing phase, and the page reloads onto it.
    const reconnected = createHmrHarness({ selfOverrides: { __AKAN_HMR_SYSTEM_PAGE__: true }, runTimers: true });
    reconnected.ws?.sendMessage({ type: "build-status", status: "error", generation: 4, phase: "pages", message: "x" });
    reconnected.ws?.sendMessage({ type: "hello", buildId: 1, failingPhases: [] });
    expect(reconnected.reloadCount).toBe(1);
  });

  test("a render error clears once this page renders again, while a build phase's error stays", async () => {
    const hmr = createHmrHarness();
    hmr.ws.sendMessage({ type: "build-status", status: "error", generation: 4, phase: "css", message: "css broke" });
    hmr.ws.sendMessage({ type: "error", message: "render broke" });
    expect(hmr.label()).toBe("Build failed: build, css");
    hmr.ws.sendMessage({ type: "rsc-refresh", buildId: 2, generation: 5 });
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
    expect(hmr.label()).toBe("Build failed: css");
  });

  test("a refresh that finishes after a newer one leaves the tab on the newer build", async () => {
    const pending: (() => void)[] = [];
    const harness = createHmrHarness({
      selfOverrides: {
        __AKAN_SSR_EPOCH__: 5,
        __AKAN_RSC_REFRESH__: () => new Promise<void>((resolve) => pending.push(resolve)),
      },
      runTimers: true,
    });
    harness.ws.sendMessage({ type: "hello", buildId: 1, ssrEpoch: 5 });
    harness.ws.sendMessage({ type: "rsc-refresh", buildId: 2, generation: 2 });
    harness.ws.sendMessage({ type: "rsc-refresh", buildId: 3, generation: 3 });
    expect(pending).toHaveLength(2);
    pending[1]?.();
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
    pending[0]?.();
    for (let tick = 0; tick < 5; tick++) await Promise.resolve();
    harness.ws.sendMessage({ type: "hello", buildId: 3, ssrEpoch: 5 });
    expect(pending).toHaveLength(2);
    expect(harness.reloadCount).toBe(0);
  });

  test("backs off a socket that opens and closes before its hello, and starts over once one says hello", () => {
    const timers: { callback: () => void; delay: number }[] = [];
    const hmr = createHmrHarness({ onTimer: (callback, delay) => timers.push({ callback, delay }) });
    const reconnect = () => {
      const socket = hmr.sockets.at(-1);
      for (const listener of socket?.listeners.get("open") ?? []) listener();
      return socket;
    };
    const drop = () => {
      hmr.sockets.at(-1)?.close();
      const timer = timers.filter((entry) => entry.delay >= 250).at(-1);
      timer?.callback();
      return timer?.delay;
    };
    reconnect();
    expect(drop()).toBe(250);
    reconnect();
    expect(drop()).toBe(500);
    reconnect()?.sendMessage({ type: "hello", buildId: 1 });
    expect(drop()).toBe(250);
  });

  test("clears legacy error overlays with legacy ok messages", () => {
    const hmr = createHmrHarness();

    hmr.ws.sendMessage({ type: "error", message: "SSR failed" });

    expect(hmr.overlay().getAttribute("data-status")).toBe("error");
    expect(hmr.label()).toBe("Build failed: build");
    expect(hmr.detail()).toContain("SSR failed");

    hmr.ws.sendMessage({ type: "ok" });

    expect(hmr.overlay().getAttribute("data-status")).toBe("ok");
    expect(hmr.label()).toBe("Build recovered");
  });
});

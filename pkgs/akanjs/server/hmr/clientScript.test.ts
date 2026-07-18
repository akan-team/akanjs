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

const createHmrHarness = () => {
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
    () => 1,
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
    expect(HMR_CLIENT_SCRIPT).toContain('if (msg.type === "client-refresh") {\n        refreshClient(msg);');
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

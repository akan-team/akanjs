import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { type NetworkStatus, network } from "../src/index.ts";

const g = globalThis as { window?: unknown };
const nav = navigator as Navigator & { connection?: unknown };
let online = true;
let connection: (EventTarget & { type?: string }) | undefined;
let host: MockHost | null = null;

beforeEach(() => {
  online = true;
  connection = undefined;
  g.window = globalThis; // online / offline fire on window in browsers
  Object.defineProperty(nav, "onLine", { get: () => online, configurable: true });
  Object.defineProperty(nav, "connection", { get: () => connection, configurable: true });
});

afterEach(() => {
  host?.uninstall();
  host = null;
  delete g.window;
  delete (nav as { onLine?: boolean }).onLine;
  delete nav.connection;
});

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("web", () => {
  test("getStatus from navigator.onLine and connection.type", async () => {
    expect(network.implementation("getStatus")).toBe("web");
    expect(await network.getStatus()).toEqual({ connected: true, type: "unknown" });
    connection = Object.assign(new EventTarget(), { type: "cellular" });
    expect(await network.getStatus()).toEqual({ connected: true, type: "cellular" });
    connection.type = "bluetooth";
    expect(await network.getStatus()).toEqual({ connected: true, type: "unknown" });
    online = false;
    expect(await network.getStatus()).toEqual({ connected: false, type: "none" });
  });

  test("change fires on online / offline and connection changes, once per real change", async () => {
    connection = Object.assign(new EventTarget(), { type: "wifi" });
    const seen: NetworkStatus[] = [];
    const stop = network.listen("change", (s) => seen.push(s));
    online = false;
    dispatchEvent(new Event("offline"));
    dispatchEvent(new Event("offline"));
    online = true;
    dispatchEvent(new Event("online"));
    connection.type = "cellular";
    connection.dispatchEvent(new Event("change"));
    stop();
    await tick();
    connection.type = "ethernet";
    connection.dispatchEvent(new Event("change")); // no listener any more
    expect(seen).toEqual([
      { connected: false, type: "none" },
      { connected: true, type: "wifi" },
      { connected: true, type: "cellular" },
    ]);
  });
});

describe("native hosts", () => {
  test("getStatus and change events go through the host", async () => {
    host = installMockHost({
      platform: "android",
      plugins: { network: { methods: { getStatus: () => ({ connected: true, type: "wifi" }) }, events: ["change"] } },
    });
    expect(await network.getStatus()).toEqual({ connected: true, type: "wifi" });
    const seen: NetworkStatus[] = [];
    const stop = network.listen("change", (s) => seen.push(s));
    await tick();
    expect(host.subscriptions("network", "change")).toBe(1);
    host.emit("network", "change", { connected: false, type: "none" });
    expect(seen).toEqual([{ connected: false, type: "none" }]);
    stop();
    await tick();
    expect(host.subscriptions("network", "change")).toBe(0);
  });

  test('desktop hosts declare "web" and use navigator.onLine inside the WebView', async () => {
    host = installMockHost({ platform: "macos", plugins: { network: "web" } });
    expect(network.implementation("getStatus")).toBe("web");
    expect(await network.getStatus()).toEqual({ connected: true, type: "unknown" });
  });

  test("a host without the plugin rejects UNSUPPORTED", async () => {
    host = installMockHost({ platform: "ios", plugins: {} });
    expect(isAkanNativeError(await network.getStatus().catch((e) => e), "UNSUPPORTED")).toBe(true);
  });
});

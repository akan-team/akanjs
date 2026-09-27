import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { fakeHost } from "../../menu/test/fake-host.ts";
import manifest from "../native-plugin.json";
import desktop from "../src/desktop.ts";
import { type Display, displayAt, screen } from "../src/index.ts";
import { sameDisplays, webDisplay } from "../src/web.ts";

let mock: MockHost | null = null;
afterEach(() => {
  mock?.uninstall();
  mock = null;
});

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const LAPTOP: Display = {
  id: 1,
  name: "Built-in Retina Display",
  bounds: rect(0, 0, 1728, 1117),
  workArea: rect(0, 33, 1728, 1084),
  scale: 2,
  primary: true,
};
const ABOVE: Display = {
  id: 2,
  name: "U32C60P",
  bounds: rect(889, -1080, 1920, 1080),
  workArea: rect(889, -1050, 1920, 1050),
  scale: 2,
  primary: false,
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("screen plugin routing", () => {
  test("macOS native, web fallback, mobile unsupported", () => {
    const plugin = { spec: "screen", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "macos")).toEqual({
      screen: { methods: ["getDisplays", "getCursorPoint"], events: ["change"] },
    });
    expect(pluginDecls([plugin], "ios")).toEqual({});
    expect(pluginDecls([plugin], "android")).toEqual({});
  });

  test("web: getDisplays from window.screen, no cursor", async () => {
    mock = installMockHost({ platform: "web", plugins: {} });
    expect(screen.implementation("getDisplays")).toBe("web");
    expect(screen.eventImplementation("change")).toBe("web");
    expect(screen.isSupported("getCursorPoint")).toBe(false);
    expect(await screen.getCursorPoint().catch((e) => e.code)).toBe("UNSUPPORTED");
    expect(await screen.getDisplays()).toEqual([]); // no DOM in bun test
  });

  test("iOS: UNSUPPORTED", async () => {
    mock = installMockHost({ platform: "ios", plugins: {} });
    expect(await screen.getDisplays().catch((e) => e.code)).toBe("UNSUPPORTED");
  });
});

describe("web fallback", () => {
  test("primary screen: menu bar and Dock from availTop/availHeight", () => {
    const d = webDisplay(
      { width: 1728, height: 1117, availWidth: 1728, availHeight: 1014, availLeft: 0, availTop: 33 },
      2,
    );
    expect(d).toEqual({
      id: 0,
      name: "",
      bounds: rect(0, 0, 1728, 1117),
      workArea: rect(0, 33, 1728, 1014),
      scale: 2,
      primary: true,
    });
  });

  test("a secondary screen's global availLeft/availTop are not taken as insets", () => {
    const d = webDisplay(
      { width: 1920, height: 1080, availWidth: 1920, availHeight: 1050, availLeft: 889, availTop: -1050 },
      2,
    );
    expect(d.workArea).toEqual(rect(0, 0, 1920, 1050));
    // Firefox's screen.left/top give the offset.
    const ff = webDisplay(
      {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1050,
        availLeft: 889,
        availTop: -1050,
        left: 889,
        top: -1080,
      },
      1,
    );
    expect(ff.workArea).toEqual(rect(0, 30, 1920, 1050));
    expect(webDisplay({ width: 800, height: 600 }, 0)).toMatchObject({ workArea: rect(0, 0, 800, 600), scale: 1 });
  });

  test("sameDisplays compares values", () => {
    expect(sameDisplays([LAPTOP, ABOVE], [structuredClone(LAPTOP), structuredClone(ABOVE)])).toBe(true);
    expect(sameDisplays([LAPTOP], [{ ...LAPTOP, scale: 1 }])).toBe(false);
    expect(sameDisplays([LAPTOP, ABOVE], [LAPTOP])).toBe(false);
  });
});

describe("screen desktop implementation", () => {
  test("maps to screen ops", async () => {
    const host = fakeHost(desktop, (op) => (op === "screen.cursor" ? { x: 86.5, y: -530 } : [LAPTOP, ABOVE]));
    expect(await host.call("getDisplays")).toMatchObject({ ok: true, result: [LAPTOP, ABOVE] });
    expect(await host.call("getCursorPoint")).toMatchObject({ ok: true, result: { x: 86.5, y: -530 } });
    expect(host.shell.map((c) => c.op)).toEqual(["screen.displays", "screen.cursor"]);
  });

  test("change: watches, re-reads on native events, emits only real changes", async () => {
    let displays: Display[] = [LAPTOP, ABOVE];
    const host = fakeHost(desktop, () => displays);
    await host.call("$listen", { event: "change" }, 1);
    await flush();
    expect(host.shell.map((c) => c.op)).toEqual(["screen.watch", "screen.displays"]);
    // AppKit posts the notification for changes that do not show in the list, and several times.
    host.fire("screen", { event: "changed" });
    host.fire("screen", { event: "changed" });
    await flush();
    expect(host.emitted).toEqual([]);
    displays = [LAPTOP];
    host.fire("screen", { event: "changed" });
    await flush();
    expect(host.emitted).toEqual([{ event: "change", data: { displays: [LAPTOP] }, windows: [1] }]);
    host.fire("screen", { event: "changed" });
    await flush();
    expect(host.emitted.length).toBe(1);
  });
});

describe("displayAt", () => {
  test("the display that contains the point, else the nearest", () => {
    expect(displayAt({ x: 1000.5, y: -530 }, [LAPTOP, ABOVE])?.id).toBe(2);
    expect(displayAt({ x: 100, y: 100 }, [LAPTOP, ABOVE])?.id).toBe(1);
    expect(displayAt({ x: 5000, y: -500 }, [LAPTOP, ABOVE])?.id).toBe(2);
    expect(displayAt({ x: 0, y: 0 }, [])).toBeUndefined();
  });
});

import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import type { Location, RouteRender } from "akanjs/client";
import { CsrPageReadiness } from "./csrPageReadiness";

let hides = 0;
let host: MockHost | null = null;

beforeAll(() => {
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 1) as unknown as number,
    cancelAnimationFrame: (frame: number) => clearTimeout(frame),
  });
});

afterEach(() => {
  host?.uninstall();
  host = null;
});

const installShell = (platform: "ios" | "web", { withSplash = true } = {}) => {
  host = installMockHost({
    platform,
    plugins: withSplash
      ? {
          "splash-screen": {
            methods: {
              hide: () => {
                hides += 1;
              },
            },
          },
        }
      : {},
  });
};

const asyncPage = (entryId: string) =>
  ({
    entryId,
    pathRoute: { renderRootLayouts: [], renderLayouts: [], renderPage: { isAsync: true } as RouteRender },
  }) as unknown as Location;

describe("NativeSplash", () => {
  test("leaves the splash alone on the web and in a shell built without the splash plugin", async () => {
    const { NativeSplash } = await import("./nativeSplash");
    installShell("web");
    NativeSplash.hideOnceDrawn(asyncPage("web-1"));
    host?.uninstall();
    installShell("ios", { withSplash: false });
    NativeSplash.hideOnceDrawn(asyncPage("bare-1"));
    CsrPageReadiness.report("web-1", "page", false);
    CsrPageReadiness.report("bare-1", "page", false);
    await Bun.sleep(20);
    expect(hides).toBe(0);
  });

  test("stops waiting when the page it waited on leaves the screen first", async () => {
    const { NativeSplash } = await import("./nativeSplash");
    installShell("ios");
    CsrPageReadiness.report("gone-1", "page", true);
    const stop = NativeSplash.hideOnceDrawn(asyncPage("gone-1"));
    await Bun.sleep(10);
    stop();
    CsrPageReadiness.report("gone-1", "page", false);
    await Bun.sleep(20);
    expect(hides).toBe(0);
  });

  test("hides the splash once the first page is drawn, and only once", async () => {
    const { NativeSplash } = await import("./nativeSplash");
    installShell("ios");
    CsrPageReadiness.report("first-1", "layout", true);
    NativeSplash.hideOnceDrawn(asyncPage("first-1"));
    await Bun.sleep(20);
    expect(hides).toBe(0);

    CsrPageReadiness.report("first-1", "layout", false);
    await Bun.sleep(20);
    expect(hides).toBe(1);

    CsrPageReadiness.report("next-1", "page", false);
    NativeSplash.hideOnceDrawn(asyncPage("next-1"));
    await Bun.sleep(20);
    expect(hides).toBe(1);
  });
});

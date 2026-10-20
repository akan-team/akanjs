import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import type { PathRoute, RouteGuard, RouteRender } from "akanjs/client";

process.env.AKAN_PUBLIC_APP_NAME = "test";
process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
//? Imported once the env is set: the store module reads it while it loads.
const { router } = await import("akanjs/client");
const { CsrGuards } = await import("./CsrGuards");

const replaced: string[] = [];
router.init({
  type: "csr",
  lang: "en",
  router: {
    push: () => undefined,
    replace: (href) => void replaced.push(href),
    back: () => undefined,
    refresh: () => undefined,
  },
});

const guarded = (guard?: RouteGuard): RouteRender => ({ render: () => null, guard });
const locationOf = (layout?: RouteGuard, page?: RouteGuard) => ({
  pathRoute: {
    renderRootLayouts: [],
    renderLayouts: [guarded(layout)],
    renderPage: guarded(page),
  } as unknown as PathRoute,
  params: { lang: "en" },
  searchParams: {},
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("CsrGuards", () => {
  test("names a location none of whose routes declares a guard, so its layers draw at once", () => {
    expect(CsrGuards.declared(locationOf())).toBe(false);
    expect(CsrGuards.declared(locationOf(undefined, async () => undefined))).toBe(true);
  });

  test("runs a location's guards once, layout first, however many of its layers wait", async () => {
    const trail: string[] = [];
    const location = locationOf(
      async () => void trail.push("layout"),
      async () => void trail.push("page"),
    );
    const [first, second] = await Promise.all([CsrGuards.of(location), CsrGuards.of(location)]);
    expect([first, second]).toEqual([true, true]);
    expect(await CsrGuards.of(location)).toBe(true);
    expect(trail).toEqual(["layout", "page"]);
  });

  test("refuses the location when a guard moves the router, skips the guards below, and asks again next time", async () => {
    replaced.length = 0;
    const session = { isSignedIn: false };
    let pageRuns = 0;
    const location = locationOf(
      async () => {
        await Promise.resolve();
        if (!session.isSignedIn) router.replace("/signin");
      },
      async () => {
        pageRuns += 1;
      },
    );
    expect(await CsrGuards.of(location)).toBe(false);
    expect(pageRuns).toBe(0);
    await settle();
    expect(replaced).toEqual(["/en/signin"]);

    session.isSignedIn = true;
    expect(await CsrGuards.of(location)).toBe(true);
    expect(pageRuns).toBe(1);
  });

  test("sends a leaked 403 or 404 to the not-found page and rethrows anything else for the layer to show", async () => {
    replaced.length = 0;
    const leaked = locationOf(undefined, async () => {
      throw Object.assign(new Error("Access denied"), { statusCode: 403 });
    });
    expect(await CsrGuards.of(leaked)).toBe(false);
    await settle();
    expect(replaced).toEqual(["/en/404"]);

    const server = { isBroken: true };
    const broken = locationOf(undefined, async () => {
      if (server.isBroken) throw new Error("broken");
    });
    await expect(CsrGuards.of(broken)).rejects.toThrow("broken");
    server.isBroken = false;
    expect(await CsrGuards.of(broken)).toBe(true);
  });
});

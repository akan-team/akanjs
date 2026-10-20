import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import type { PathRoute, RouteGuard, RouteRender } from "akanjs/client";

process.env.AKAN_PUBLIC_APP_NAME = "test";
process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
//? Imported once the env is set: the store module reads it while it loads.
const { page, router } = await import("akanjs/client");
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
let entries = 0;
const locationOf = (layout?: RouteGuard, page?: RouteGuard) => ({
  entryId: `entry-${++entries}`,
  pathRoute: {
    path: "/org/:orgId/home",
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

  test("runs a location's guards once, layout first, however many of its layers wait or render again", async () => {
    const trail: string[] = [];
    const location = locationOf(
      async () => void trail.push("layout"),
      async () => void trail.push("page"),
    );
    const [first, second] = await Promise.all([CsrGuards.of(location), CsrGuards.of({ ...location })]);
    expect([first, second]).toEqual([true, true]);
    expect(await CsrGuards.of({ ...location })).toBe(true);
    expect(trail).toEqual(["layout", "page"]);
    expect(await CsrGuards.of({ ...location, searchParams: { tab: "2" } })).toBe(true);
    expect(trail).toEqual(["layout", "page", "layout", "page"]);
  });

  test("keys a chain guard's verdict by the args it reads, so a query it never reads keeps it", async () => {
    let runs = 0;
    const { guard } = page()
      .param("orgId", String)
      .search("tab", String)
      .guard(() => {
        runs += 1;
      })
      .render(() => null)
      .toRouteModule();
    const location = { ...locationOf(undefined, guard), params: { lang: "en", orgId: "1" } };
    const moves: Parameters<typeof CsrGuards.of>[0][] = [
      location,
      { ...location, searchParams: { q: "typed" } },
      { ...location, searchParams: { tab: "2" } },
      { ...location, params: { lang: "en", orgId: "2" } },
    ];
    for (const moved of moves) expect(await CsrGuards.of(moved)).toBe(true);
    expect(runs).toBe(3);
  });

  test("holds a verdict while a layer of its location is on screen, and asks again once none is", async () => {
    let runs = 0;
    const location = locationOf(undefined, async () => {
      runs += 1;
    });
    const key = CsrGuards.keyOf(location);
    const releaseLayout = CsrGuards.hold(key);
    const releasePage = CsrGuards.hold(key);
    expect(await CsrGuards.of(location)).toBe(true);
    expect([CsrGuards.admitted(key), runs]).toEqual([true, 1]);
    releaseLayout();
    expect(await CsrGuards.of(location)).toBe(true);
    expect(runs).toBe(1);
    releasePage();
    await Promise.resolve();
    expect([CsrGuards.admitted(key), CsrGuards.asked(key)]).toEqual([false, false]);
    expect(await CsrGuards.of(location)).toBe(true);
    expect(runs).toBe(2);
  });

  test("keeps a run in flight past its last holder, so a page back before it settles asks no second time", async () => {
    let runs = 0;
    let finish: () => void = () => undefined;
    const location = locationOf(undefined, async () => {
      runs += 1;
      await new Promise<void>((resolve) => (finish = resolve));
    });
    const key = CsrGuards.keyOf(location);
    const release = CsrGuards.hold(key);
    const run = CsrGuards.of(location);
    release();
    await Promise.resolve();
    const releaseAgain = CsrGuards.hold(key);
    expect(CsrGuards.of(location)).toBe(run);
    releaseAgain();
    await Promise.resolve();
    finish();
    expect(await run).toBe(true);
    expect([runs, CsrGuards.admitted(key), CsrGuards.asked(key)]).toEqual([1, false, false]);
  });

  test("keeps a run in flight when its last holder lets go and holds again within one tick, as StrictMode does", async () => {
    let runs = 0;
    const location = locationOf(undefined, async () => {
      runs += 1;
    });
    const key = CsrGuards.keyOf(location);
    const release = CsrGuards.hold(key);
    const run = CsrGuards.of(location);
    release();
    const releaseAgain = CsrGuards.hold(key);
    expect(await run).toBe(true);
    expect([CsrGuards.admitted(key), runs]).toEqual([true, 1]);
    releaseAgain();
    await Promise.resolve();
    expect(CsrGuards.asked(key)).toBe(false);
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

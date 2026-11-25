import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import type { CsrContextType, PathRoute, RouteGuide, TransitionType } from "akanjs/client";
import { Activity, act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { PendingNavigation } from "../client/pendingNavigation";
import { setTestEnv } from "../ui/testHelpers.fixture";

let useCsrValues: typeof import("./useCsrValues").useCsrValues;
let CsrSlide: typeof import("./csrSlide").CsrSlide;
let NativeNavigation: typeof import("./nativeNavigation").NativeNavigation;
let RenderLayer: typeof import("./RenderLayer").RenderLayer;
let client: typeof import("akanjs/client");
let defaultPageState: typeof import("akanjs/client").defaultPageState;

beforeAll(async () => {
  setTestEnv("csrvaluestest");
  ({ useCsrValues } = await import("./useCsrValues"));
  ({ CsrSlide } = await import("./csrSlide"));
  ({ NativeNavigation } = await import("./nativeNavigation"));
  ({ RenderLayer } = await import("./RenderLayer"));
  client = await import("akanjs/client");
  ({ defaultPageState } = client);
  const sent = { jwt: null as string | null };
  client.registerClientRuntime({
    fetch: {
      instance: sent,
      setJwt: (jwt: string | null) => {
        sent.jwt = jwt;
      },
    },
  } as never);
});

const pathRouteOf = (
  segment: string,
  transition: TransitionType = "none",
  cache = false,
  gesture = defaultPageState.gesture,
): PathRoute =>
  ({
    path: `/:lang/${segment}`,
    pathSegments: ["/", "/:lang", `/${segment}`],
    pageState: { ...defaultPageState, transition, cache, gesture },
    renderPage: {},
    renderRootLayouts: [],
    renderLayouts: [],
  }) as unknown as PathRoute;

const guideOf = (pathRoutes: PathRoute[]): RouteGuide => {
  const children = Object.fromEntries(
    pathRoutes.map((pathRoute) => {
      const segment = pathRoute.pathSegments[2];
      return [segment, { pathSegment: segment, pathRoute, children: {} }];
    }),
  );
  return { pathSegment: "/", children: { "/:lang": { pathSegment: "/:lang", children } } };
};

const routesOf = (segments: string[], transition?: TransitionType, cached: string[] = []) => {
  const pathRoutes = segments.map((segment) => pathRouteOf(segment, transition, cached.includes(segment)));
  return { routeGuide: guideOf(pathRoutes), pathRoutes };
};

const mountCsr = (path: string, transition?: TransitionType, cached: string[] = []) => {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`http://localhost${path}`);
  const { routeGuide, pathRoutes } = routesOf(["a", "b", "c"], transition, cached);
  const seen: { first?: CsrContextType; latest?: CsrContextType } = {};
  const Probe = () => {
    const values = useCsrValues(routeGuide, pathRoutes);
    seen.first ??= values;
    seen.latest = values;
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  return { seen, unmount: () => act(() => root.unmount()) };
};

describe("useCsrValues", () => {
  test("a cache page visited again at the same address comes back as the entry it keeps, so nothing on it changes", () => {
    const { seen, unmount } = mountCsr("/en/a", "none", ["a", "b"]);
    const router = seen.first?.router;
    if (!router) throw new Error("the frame did not render");
    const kept = seen.latest?.location.entryId;
    act(() => void router.replace("/en/b"));
    expect(seen.latest?.location.pathname).toBe("/en/b");
    act(() => void router.replace("/en/a"));
    expect(seen.latest?.location.entryId).toBe(kept);
    act(() => void router.replace("/en/b"));
    act(() => void router.replace("/en/a?tab=2"));
    expect(seen.latest?.location.entryId).not.toBe(kept);
    unmount();
  });

  test("the router handed out at mount keeps moving the stack it now holds", () => {
    const { seen, unmount } = mountCsr("/en/a");
    const router = seen.first?.router;
    if (!router) throw new Error("the frame did not render");

    act(() => void router.push("/en/b"));
    expect(seen.latest?.location.pathname).toBe("/en/b");
    expect(seen.latest?.prevLocation?.pathname).toBe("/en/a");

    act(() => void router.replace("/en/c"));
    expect(seen.latest?.location.pathname).toBe("/en/c");
    expect(seen.latest?.prevLocation?.pathname).toBe("/en/a");
    expect(seen.latest?.router).toBe(router);
    unmount();
  });

  test("a refresh asks the page on screen to render again instead of reloading the document", async () => {
    const { CsrRefresh } = await import("./csrRefresh");
    const { seen, unmount } = mountCsr("/en/a");
    const router = seen.first?.router;
    if (!router) throw new Error("the frame did not render");
    act(() => void router.push("/en/b"));
    const reload = spyOn(client.csrLocation, "reload").mockImplementation(() => undefined);
    const before = CsrRefresh.current().epoch;

    act(() => router.refresh());

    expect(reload).not.toHaveBeenCalled();
    expect(CsrRefresh.current()).toEqual({
      epoch: before + 1,
      locationId: CsrRefresh.idOf(seen.latest?.location ?? { href: "" }),
    });
    expect(CsrRefresh.current().locationId).toEndWith(" /en/b");
    expect(seen.latest?.location.pathname).toBe("/en/b");
    reload.mockRestore();
    unmount();
  });

  test("a back slides the page off by the width the frame has now, not the width it mounted at", () => {
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    const { seen, unmount } = mountCsr("/en/b", "stack");
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
    act(() => window.dispatchEvent(new Event("resize")));
    const latest = seen.latest;
    if (!latest) throw new Error("the frame did not render");
    expect(latest.frameLayout.viewport.width).toBe(800);

    void latest.onBack.current.stack?.();
    expect(latest.transUnit.goal).toBe(800);
    unmount();
  });
});

describe("useCsrValues across an account change", () => {
  afterEach(() => client.resetAuth());

  const keyOf = (seen: { latest?: CsrContextType }, pathname: string) =>
    seen.latest?.stackEntries.find(({ location }) => location.pathname === pathname)?.key;
  const routerOf = (seen: { first?: CsrContextType }) => {
    const router = seen.first?.router;
    if (!router) throw new Error("the frame did not render");
    return router;
  };

  test("a page kept for the previous account is let go, and drawn afresh when it is visited", () => {
    const { seen, unmount } = mountCsr("/en/a", undefined, ["a"]);
    const router = routerOf(seen);
    act(() => void router.push("/en/b"));
    act(() => void router.push("/en/c"));
    const kept = keyOf(seen, "/en/a");
    expect(kept).toBeDefined();

    act(() => client.setAuth({ jwt: "someone" }));
    expect(keyOf(seen, "/en/a")).toBeUndefined();

    act(() => void router.push("/en/a"));
    expect(keyOf(seen, "/en/a")).toBeDefined();
    expect(keyOf(seen, "/en/a")).not.toBe(kept);
    unmount();
  });

  test("the page under the current one is drawn again, so going back shows the new account's page", async () => {
    act(() => client.setAuth({ jwt: "someone" }));
    const { seen, unmount } = mountCsr("/en/b");
    const router = routerOf(seen);
    act(() => void router.push("/en/c"));
    const under = keyOf(seen, "/en/b");

    act(() => client.resetAuth());
    const redrawn = keyOf(seen, "/en/b");
    expect(redrawn).toBeDefined();
    expect(redrawn).not.toBe(under);

    await act(async () => void (await router.back()));
    expect(seen.latest?.location.pathname).toBe("/en/b");
    expect(keyOf(seen, "/en/b")).toBe(redrawn);
    unmount();
  });

  test("the page on screen stays as drawn until it is left, and is then drawn again under the next one", async () => {
    const { seen, unmount } = mountCsr("/en/b");
    const router = routerOf(seen);
    const shown = keyOf(seen, "/en/b");

    act(() => client.setAuth({ jwt: "someone" }));
    expect(keyOf(seen, "/en/b")).toBe(shown);

    act(() => void router.push("/en/c"));
    const redrawn = keyOf(seen, "/en/b");
    expect(redrawn).toBeDefined();
    expect(redrawn).not.toBe(shown);

    await act(async () => void (await router.back()));
    expect(keyOf(seen, "/en/b")).toBe(redrawn);
    unmount();
  });

  test("the same token handed over again keeps every page", () => {
    act(() => client.setAuth({ jwt: "someone" }));
    const { seen, unmount } = mountCsr("/en/a", undefined, ["a"]);
    const router = routerOf(seen);
    act(() => void router.push("/en/b"));
    const kept = keyOf(seen, "/en/a");
    const shown = keyOf(seen, "/en/b");

    act(() => client.setAuth({ jwt: "someone" }));
    expect(keyOf(seen, "/en/a")).toBe(kept);
    expect(keyOf(seen, "/en/b")).toBe(shown);
    unmount();
  });
});

interface Screen {
  segment: string;
  transition?: TransitionType;
  guard?: () => void | Promise<void>;
  cache?: boolean;
  gesture?: boolean;
  sync?: boolean;
  drawsAfterMs?: number;
}

const screenRouteOf = ({
  segment,
  transition = "none",
  guard,
  cache,
  gesture,
  sync,
  drawsAfterMs,
}: Screen): PathRoute => {
  const view = () => <main>{segment}</main>;
  if (sync)
    return { ...pathRouteOf(segment, transition, cache, gesture), renderPage: { kind: "page", render: view } } as never;
  const slowView = async () => {
    await new Promise((resolve) => setTimeout(resolve, drawsAfterMs));
    return view();
  };
  const drawn = drawsAfterMs ? slowView : view;
  const mod = (
    guard ? client.page().guard(guard).render(drawn).toRouteModule() : client.page().render(drawn).toRouteModule()
  ) as { default: unknown; guard?: unknown };
  return {
    ...pathRouteOf(segment, transition, cache, gesture),
    renderPage: { kind: "page", isAsync: true, render: mod.default, guard: mod.guard },
  } as unknown as PathRoute;
};

const notFoundRouteOf = (pathname: string) =>
  ({
    ...pathRouteOf("*"),
    renderPage: { kind: "page", isAsync: true, render: async () => <main>{`missing ${pathname}`}</main> },
  }) as unknown as PathRoute;

let unmountFrame: (() => void) | null = null;
afterEach(() => {
  unmountFrame?.();
  unmountFrame = null;
  //? A test ending on the path the next one opens on would hand it its stack, as a reload does.
  sessionStorage.clear();
  //? A guard still awaiting when its frame unmounts would otherwise redirect the next test's frame.
  const nowhere = () => undefined;
  client.router.init({
    type: "csr",
    lang: "en",
    router: { push: nowhere, replace: nowhere, back: nowhere, refresh: nowhere },
  });
});

//? Draws each stack entry's page through RenderLayer as CSR.tsx does, so a pending page's guard runs and moves the router.
const mountFrame = (path: string, screens: Screen[], { tabBarOn }: { tabBarOn?: string } = {}) => {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`http://localhost${path}`);
  const tabLayout = { render: () => null };
  const pathRoutes = screens
    .map(screenRouteOf)
    .map((pathRoute) =>
      tabBarOn ? ({ ...pathRoute, renderLayouts: [tabLayout] } as unknown as PathRoute) : pathRoute,
    );
  const routeGuide = guideOf(pathRoutes);
  const langGuide = routeGuide.children["/:lang"];
  if (langGuide) langGuide.notFoundRouteOf = notFoundRouteOf;
  const seen: { latest?: CsrContextType; shown: string[] } = { shown: [] };
  const Frame = () => {
    const values = useCsrValues(routeGuide, pathRoutes);
    seen.latest = values;
    useEffect(() => {
      const canGoBack = () => values.history.current.idx > 0;
      client.router.init({ type: "csr", lang: "en", router: { ...values.router, canGoBack } });
    }, []);
    useEffect(() => void seen.shown.push(values.location.pathname), [values.location.pathname]);
    //? What `Layout.BottomTab` registers: every page under its layout then reads `cache` in its resolved page state.
    useEffect(() => {
      if (!tabBarOn) return;
      return values.registerFrameSlot(`/:lang/${tabBarOn}`, {
        type: "bottomInset",
        scope: "layout",
        source: "bottomTab",
        cache: true,
        height: 64,
      });
    }, []);
    return values.stackEntries.map(({ key, location, pageType }) => {
      const activity = pageType === "cached" ? "hidden" : pageType;
      return (
        <Activity key={key} mode={activity === "hidden" ? "hidden" : "visible"}>
          <client.pageActivityContext.Provider value={{ activity, focused: activity === "current" }}>
            <client.pathContext.Provider value={{ location } as never}>
              <RenderLayer
                renders={[location.pathRoute.renderPage]}
                index={0}
                params={location.params}
                searchParams={location.searchParams}
              />
            </client.pathContext.Provider>
          </client.pageActivityContext.Provider>
        </Activity>
      );
    });
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<Frame />));
  unmountFrame = () => act(() => root.unmount());
  return { seen, container, stack: () => seen.latest?.history.current.locations.map(({ pathname }) => pathname) };
};

const elapse = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

//? `act` holds every render until it returns, so a page drawn ahead reports drawn only between two waits.
const drawnWithin = async (ms: number) => {
  for (let waited = 0; waited < ms; waited += 25) await elapse(25);
};

describe("useCsrValues when a page is refused as it slides in", () => {
  const toSignin = () => client.router.redirect("/signin");

  test("a refusal before the page slides in sends the visitor on, and the page never shows", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", transition: "stack", guard: toSignin },
      { segment: "signin" },
    ]);

    await act(async () => void client.router.push("/detail"));
    await elapse(900);

    expect(frame.seen.latest?.location.pathname).toBe("/en/signin");
    expect(frame.stack()).toEqual(["/en/home", "/en/signin"]);
    expect(frame.seen.shown).not.toContain("/en/detail");
  });

  test("a redirect to a page that slides in too is not dropped while the refused one prepares", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", transition: "stack", guard: toSignin },
      { segment: "signin", transition: "stack" },
    ]);

    await act(async () => void client.router.push("/detail"));
    await elapse(900);

    expect(frame.seen.latest?.location.pathname).toBe("/en/signin");
    expect(frame.stack()).toEqual(["/en/home", "/en/signin"]);
    expect(frame.seen.shown).not.toContain("/en/detail");
  });

  test("a refusal that lands while the page slides in moves on once it has", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      {
        segment: "detail",
        transition: "stack",
        guard: async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          toSignin();
        },
      },
      { segment: "signin", transition: "stack" },
    ]);

    await act(async () => void client.router.push("/detail"));
    await elapse(1300);

    expect(frame.seen.latest?.location.pathname).toBe("/en/signin");
    expect(frame.stack()).toEqual(["/en/home", "/en/signin"]);
  });

  test("a move a guard sends back to the page on screen before it shows is reported as turned back, a plain one is not", async () => {
    const turnedBack = spyOn(NativeNavigation, "turnedBack");
    const frame = mountFrame("/en/signin", [
      { segment: "signin" },
      { segment: "home", transition: "stack", guard: () => client.router.redirect("/signin") },
      { segment: "news" },
    ]);

    await act(async () => void client.router.push("/home"));
    await elapse(900);
    expect(frame.seen.latest?.location.pathname).toBe("/en/signin");
    expect(frame.seen.shown).not.toContain("/en/home");
    expect(turnedBack).toHaveBeenCalledTimes(1);

    await act(async () => void client.router.push("/news"));
    await elapse(900);
    expect(frame.seen.latest?.location.pathname).toBe("/en/news");
    expect(turnedBack).toHaveBeenCalledTimes(1);
    turnedBack.mockRestore();
  });

  test("a page that redirected keeps its redirect on its way when a page out of sight redirects back to it", async () => {
    const frame = mountFrame("/en/org", [{ segment: "org" }, { segment: "home", drawsAfterMs: 300 }]);

    act(() => void client.router.redirect("/home"));
    await elapse(100);
    act(() => void client.router.redirect("/org"));
    await drawnWithin(700);

    expect(frame.seen.latest?.location.pathname).toBe("/en/home");
    expect(frame.stack()).toEqual(["/en/home"]);
  });

  test("a redirect back to the page the visitor is on leaves the stack as it was", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", transition: "stack", guard: () => client.router.redirect("/home") },
    ]);

    await act(async () => void client.router.push("/detail"));
    await elapse(900);

    expect(frame.seen.latest?.location.pathname).toBe("/en/home");
    expect(frame.stack()).toEqual(["/en/home"]);
    expect(frame.seen.shown).not.toContain("/en/detail");
  });
});

describe("useCsrValues while a page slides in", () => {
  test("a second push to the page already on its way adds no entry", async () => {
    const frame = mountFrame("/en/home", [{ segment: "home" }, { segment: "detail", transition: "stack" }]);

    await act(async () => {
      client.router.push("/detail");
      client.router.push("/detail");
    });
    await elapse(600);

    expect(frame.stack()).toEqual(["/en/home", "/en/detail"]);
  });

  test("a back before the page shows cancels its push", async () => {
    const frame = mountFrame("/en/home", [{ segment: "home" }, { segment: "detail", transition: "stack" }]);

    await act(async () => {
      client.router.push("/detail");
      client.router.back();
    });
    await elapse(600);

    expect(frame.seen.latest?.location.pathname).toBe("/en/home");
    expect(frame.stack()).toEqual(["/en/home"]);
  });

  test("a browser back before the page shows leaves it unpushed", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "list" },
      { segment: "detail", transition: "stack" },
    ]);
    await act(async () => void client.router.push("/list"));

    await act(async () => {
      client.router.push("/detail");
      window.history.back();
    });
    await elapse(600);

    expect(frame.seen.latest?.location.pathname).toBe("/en/home");
    expect(frame.stack()).not.toContain("/en/detail");
  });

  test("an animated replace leaves the entry before it under the page once it settles", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", transition: "stack" },
      { segment: "comments", transition: "stack" },
    ]);
    await act(async () => void client.router.push("/detail"));
    await elapse(500);

    await act(async () => void client.router.replace("/comments"));
    await drawnWithin(500);

    expect(frame.stack()).toEqual(["/en/home", "/en/comments"]);
    expect(frame.seen.latest?.prevLocation?.pathname).toBe("/en/home");
  });

  test("a page that draws later slides in at once with its fallback, and its content lands in place", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", transition: "stack", drawsAfterMs: 300 },
    ]);

    await act(async () => void client.router.push("/detail"));
    await drawnWithin(150);
    expect(frame.seen.latest?.location.pathname).toBe("/en/detail");
    expect(frame.seen.latest?.phase).toBe("transitioning");
    expect(frame.container.textContent).not.toContain("detail");

    await drawnWithin(300);
    expect(frame.container.textContent).toContain("detail");
  });

  test("a push made while one page slides in runs once it has, instead of being dropped", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", transition: "stack" },
      { segment: "comments", transition: "stack" },
    ]);

    await act(async () => void client.router.push("/detail"));
    await elapse(150);
    expect(frame.seen.latest?.phase).toBe("transitioning");
    await act(async () => void client.router.push("/comments"));
    await elapse(1000);

    expect(frame.seen.latest?.location.pathname).toBe("/en/comments");
    expect(frame.stack()).toEqual(["/en/home", "/en/detail", "/en/comments"]);
  });
});

describe("router.navigation() on the CSR stack", () => {
  const landing = () => {
    const seen: { at?: string } = {};
    void client.router.navigation().then(() => {
      seen.at = client.csrLocation.pathname;
    });
    return seen;
  };

  test("settles once the page has slid in, on the page it moved to, not when the move is asked", async () => {
    mountFrame("/en/home", [{ segment: "home" }, { segment: "detail", transition: "stack" }]);
    let landed: { at?: string } = {};

    await act(async () => {
      client.router.push("/detail");
      landed = landing();
    });
    expect(landed.at).toBeUndefined();
    await elapse(600);

    expect(landed.at).toBe("/en/detail");
  });

  test("a push made while another page slides in settles once it has run", async () => {
    mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", transition: "stack" },
      { segment: "comments", transition: "stack" },
    ]);
    await act(async () => void client.router.push("/detail"));
    await elapse(150);
    let landed: { at?: string } = {};

    await act(async () => {
      client.router.push("/comments");
      landed = landing();
    });
    await elapse(100);
    expect(landed.at).toBeUndefined();
    await elapse(1000);

    expect(landed.at).toBe("/en/comments");
  });

  test("a push a back drops before its page shows settles where the page stayed", async () => {
    mountFrame("/en/home", [{ segment: "home" }, { segment: "detail", transition: "stack" }]);
    let landed: { at?: string } = {};

    await act(async () => {
      client.router.push("/detail");
      landed = landing();
      client.router.back();
    });
    await elapse(600);

    expect(landed.at).toBe("/en/home");
  });
});

describe("router.backOrReplace on the CSR stack", () => {
  const screens: Screen[] = [
    { segment: "home" },
    { segment: "list", sync: true },
    { segment: "detail", transition: "stack", sync: true },
  ];

  test("a second tap while the first one's back plays steps back once, to the page `href` names", async () => {
    const frame = mountFrame("/en/home", screens);
    await act(async () => void client.router.push("/list"));
    await act(async () => void client.router.push("/detail"));
    await elapse(600);
    expect(frame.stack()).toEqual(["/en/home", "/en/list", "/en/detail"]);

    await act(async () => void client.router.backOrReplace("/list"));
    await elapse(5);
    await act(async () => void client.router.backOrReplace("/list"));
    await elapse(600);

    expect(frame.seen.latest?.location.pathname).toBe("/en/list");
    expect(window.location.pathname).toBe("/en/list");
  });

  test("a push that keeps the pathname is rewritten in place, so backOrReplace rewrites it back and keeps the page under", async () => {
    const frame = mountFrame("/en/home", screens);
    await act(async () => void client.router.push("/list"));
    await act(async () => void client.router.push("/list?id=1"));
    await elapse(100);

    await act(async () => void client.router.backOrReplace("/list"));
    await elapse(100);

    expect(`${window.location.pathname}${window.location.search}`).toBe("/en/list");
    expect(frame.stack()).toEqual(["/en/home", "/en/list"]);
  });
});

describe("useCsrValues when a page is switched in place", () => {
  test("a page that draws later stays out of sight until it is drawn, then takes the screen", async () => {
    const frame = mountFrame("/en/home", [{ segment: "home" }, { segment: "news", drawsAfterMs: 80 }]);

    await act(async () => void client.router.push("/news"));
    expect(frame.seen.latest?.location.pathname).toBe("/en/home");
    expect(frame.seen.latest?.pendingLocation?.pathname).toBe("/en/news");
    expect(frame.stack()).toEqual(["/en/home"]);

    await drawnWithin(200);
    expect(frame.seen.latest?.location.pathname).toBe("/en/news");
    expect(frame.seen.latest?.phase).toBe("idle");
    expect(frame.stack()).toEqual(["/en/home", "/en/news"]);
    expect(frame.container.textContent).toContain("news");
  });

  test("a page slower than the wait takes the screen with its fallback", async () => {
    const frame = mountFrame("/en/home", [{ segment: "home" }, { segment: "news", drawsAfterMs: 1000 }]);

    await act(async () => void client.router.push("/news"));
    await elapse(450);

    expect(frame.seen.latest?.location.pathname).toBe("/en/news");
    expect(frame.container.textContent).not.toContain("news");
  });

  test("a page that draws as it mounts takes the screen in the same commit", async () => {
    const frame = mountFrame("/en/home", [{ segment: "home" }, { segment: "news", sync: true }]);

    await act(async () => void client.router.push("/news"));

    expect(frame.seen.latest?.location.pathname).toBe("/en/news");
    expect(frame.seen.latest?.pendingLocation).toBeNull();
  });

  test("under a tab bar, which caches its layout's pages, a drawn page is still found drawn", async () => {
    const frame = mountFrame("/en/home", [{ segment: "home" }, { segment: "news" }], { tabBarOn: "home" });

    await act(async () => void client.router.push("/news"));
    await drawnWithin(150);

    expect(frame.seen.latest?.location.pathname).toBe("/en/news");
  });

  test("a page the stack kept, hidden since, is shown at once when it is visited again", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home", cache: true },
      { segment: "news", cache: true },
      { segment: "more", cache: true },
    ]);
    await act(async () => void client.router.push("/news"));
    await drawnWithin(150);
    await act(async () => void client.router.push("/more"));
    await drawnWithin(150);
    expect(frame.seen.latest?.location.pathname).toBe("/en/more");

    await act(async () => void client.router.push("/home"));

    expect(frame.seen.latest?.location.pathname).toBe("/en/home");
    expect(frame.seen.latest?.pendingLocation).toBeNull();
  });

  test("switching tabs between pages that do not slide starts no slide, there or back", async () => {
    const play = spyOn(CsrSlide, "play");
    mountFrame(
      "/en/home",
      [
        { segment: "home", cache: true },
        { segment: "news", cache: true },
      ],
      { tabBarOn: "home" },
    );
    await act(async () => void client.router.replace("/news"));
    await drawnWithin(150);
    await act(async () => void client.router.replace("/home"));
    await drawnWithin(150);

    expect(play).not.toHaveBeenCalled();
    play.mockRestore();
  });

  test("a stack page pushed on still slides in", async () => {
    const play = spyOn(CsrSlide, "play");
    mountFrame("/en/home", [{ segment: "home" }, { segment: "detail", transition: "stack" }]);
    await act(async () => void client.router.push("/detail"));
    await drawnWithin(150);

    expect(play).toHaveBeenCalledTimes(1);
    play.mockRestore();
  });

  test("a push that changes only the query of the page on screen redraws it in place: one back leaves it", async () => {
    const frame = mountFrame("/en/home", [{ segment: "home" }, { segment: "detail", transition: "stack" }]);
    await act(async () => void client.router.push("/detail"));
    await elapse(600);
    const entryId = frame.seen.latest?.location.entryId;
    const play = spyOn(CsrSlide, "play");

    await act(async () => void client.router.push("/detail?ticketId=1"));
    await drawnWithin(150);

    expect(frame.stack()).toEqual(["/en/home", "/en/detail"]);
    expect(frame.seen.latest?.location.search).toBe("ticketId=1");
    expect(frame.seen.latest?.location.entryId).toBe(entryId);
    expect(play).not.toHaveBeenCalled();
    play.mockRestore();
  });

  test("a tab that does not slide, switched in place of a stack page, still swipes back as that page did", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "board", transition: "stack" },
      { segment: "finance", gesture: false },
    ]);
    await act(async () => void client.router.push("/board"));
    await elapse(600);
    await act(async () => void client.router.replace("/finance"));
    await drawnWithin(150);

    const latest = frame.seen.latest;
    if (!latest) throw new Error("the frame did not render");
    expect(latest.location.pathname).toBe("/en/finance");
    expect(CsrSlide.motionOf(latest.location)).toBe("stack");
    expect(CsrSlide.swipesBack(latest.location)).toBe(true);
    expect(Object.keys(latest.pageBind())).not.toHaveLength(0);
  });

  test("a stack page a tab that does not slide is switched to with replace changes in place", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "board", transition: "stack" },
      { segment: "finance" },
    ]);
    await act(async () => void client.router.push("/board"));
    await elapse(600);
    await act(async () => void client.router.replace("/finance"));
    await drawnWithin(150);
    const play = spyOn(CsrSlide, "play");

    await act(async () => void client.router.replace("/board"));
    await drawnWithin(150);

    expect(frame.stack()).toEqual(["/en/home", "/en/board"]);
    expect(play).not.toHaveBeenCalled();
    play.mockRestore();
  });

  test("a move made while another page slides in is not drawn ahead: the slide's end would drop its page", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", transition: "stack" },
      { segment: "news", drawsAfterMs: 80 },
    ]);
    await act(async () => void client.router.push("/detail"));
    await elapse(150);
    expect(frame.seen.latest?.phase).toBe("transitioning");

    await act(async () => void client.router.push("/news"));

    expect(frame.seen.latest?.location.pathname).toBe("/en/news");
    expect(frame.seen.latest?.pendingLocation).toBeNull();
    await elapse(500);
    expect(frame.stack()).toEqual(["/en/home", "/en/detail", "/en/news"]);
  });

  test("a redirect from the page drawn ahead takes its place, and the page never shows", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "news", guard: () => client.router.redirect("/signin") },
      { segment: "signin" },
    ]);

    await act(async () => void client.router.push("/news"));
    await elapse(450);

    expect(frame.seen.latest?.location.pathname).toBe("/en/signin");
    expect(frame.stack()).toEqual(["/en/home", "/en/signin"]);
    expect(frame.seen.shown).not.toContain("/en/news");
  });
});

describe("useCsrValues for a path no page matches", () => {
  test("a push to it draws its not-found instead of throwing", async () => {
    const frame = mountFrame("/en/home", [{ segment: "home" }]);

    await act(async () => void client.router.push("/missing"));
    await elapse(50);

    expect(frame.seen.latest?.location.pathname).toBe("/en/missing");
    expect(frame.container.textContent).toContain("missing /en/missing");
  });

  test("a guard's router.notFound() draws the not-found in place of the refused page, not a blank one", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", guard: () => client.router.notFound() },
    ]);

    await act(async () => void client.router.push("/detail"));
    await elapse(400);

    expect(frame.seen.latest?.location.pathname).toBe("/en/404");
    expect(frame.stack()).toEqual(["/en/home", "/en/404"]);
    expect(frame.container.textContent).toContain("missing /en/404");
  });
});

describe("useCsrValues for an external http(s) URL", () => {
  test("a push leaves for it and a redirect leaves for it in place of the page, drawing nothing on the stack", async () => {
    const frame = mountFrame("/en/home", [{ segment: "home" }]);
    const assign = spyOn(client.csrLocation, "assign").mockImplementation(() => undefined);
    const replace = spyOn(window.location, "replace").mockImplementation(() => undefined);
    try {
      await act(async () => void client.router.push("https://example.com/docs?sig=1", { external: true }));
      await act(async () => void client.router.redirect("HTTPS://example.com/signin", { external: true }));
      await elapse(50);

      expect(assign.mock.calls).toEqual([["https://example.com/docs?sig=1"]]);
      expect(replace.mock.calls).toEqual([["https://example.com/signin"]]);
      expect(frame.stack()).toEqual(["/en/home"]);
      expect(frame.container.textContent).toBe("home");
    } finally {
      assign.mockRestore();
      replace.mockRestore();
    }
  });
});

describe("useCsrValues pending navigation", () => {
  const endsOf = (frame: ReturnType<typeof mountFrame>) => {
    const ends: (string | undefined)[] = [];
    let inFlight = !!PendingNavigation.entry();
    const unsubscribe = PendingNavigation.subscribe(() => {
      if (inFlight && !PendingNavigation.entry()) ends.push(frame.seen.latest?.location.pathname);
      inFlight = !!PendingNavigation.entry();
    });
    return { ends, unsubscribe };
  };

  test("a page switched in place is pending from the press until it takes the screen", async () => {
    const frame = mountFrame("/en/home", [{ segment: "home" }, { segment: "news", drawsAfterMs: 80 }]);
    const { ends, unsubscribe } = endsOf(frame);

    await act(async () => void client.router.push("/news"));
    expect(PendingNavigation.entry()).toMatchObject({
      href: "http://localhost/en/news",
      from: "http://localhost/en/home",
      traversal: false,
      waits: true,
    });

    await drawnWithin(200);
    unsubscribe();
    expect(PendingNavigation.entry()).toBeNull();
    expect(ends).toEqual(["/en/news"]);
    expect(frame.container.textContent).toContain("news");
  });

  test("a page that slides in is pending until it is on screen, showing its fallback", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", transition: "stack", drawsAfterMs: 300 },
    ]);
    const { ends, unsubscribe } = endsOf(frame);

    await act(async () => void client.router.push("/detail"));
    expect(PendingNavigation.get()).toBe("http://localhost/en/detail");

    await drawnWithin(150);
    unsubscribe();
    expect(PendingNavigation.entry()).toBeNull();
    expect(ends).toEqual(["/en/detail"]);
    expect(frame.container.textContent).not.toContain("detail");
  });

  test("a page the stack keeps, or one that draws as it mounts, is never pending", async () => {
    mountFrame("/en/home", [
      { segment: "home", cache: true },
      { segment: "news", cache: true },
      { segment: "faq", sync: true },
    ]);
    await act(async () => void client.router.push("/news"));
    await drawnWithin(150);
    const seen: (string | null)[] = [];
    const unsubscribe = PendingNavigation.subscribe(() => seen.push(PendingNavigation.get()));

    await act(async () => void client.router.push("/home"));
    await act(async () => void client.router.push("/faq"));
    unsubscribe();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter(Boolean)).toEqual([]);
    expect(PendingNavigation.entry()).toBeNull();
  });

  test("a back before the page shows ends its pending navigation, and a newer push takes its place", async () => {
    mountFrame("/en/home", [
      { segment: "home" },
      { segment: "news", drawsAfterMs: 1000 },
      { segment: "more", drawsAfterMs: 1000 },
    ]);

    await act(async () => void client.router.push("/news"));
    await act(async () => void client.router.push("/more"));
    expect(PendingNavigation.get()).toBe("http://localhost/en/more");

    await act(async () => void client.router.back());
    expect(PendingNavigation.entry()).toBeNull();
  });

  test("a push made while a page slides in is pending from the press until its own page slides in", async () => {
    const frame = mountFrame("/en/home", [
      { segment: "home" },
      { segment: "detail", transition: "stack" },
      { segment: "comments", transition: "stack", drawsAfterMs: 1000 },
    ]);
    await act(async () => void client.router.push("/detail"));
    await elapse(150);
    expect(frame.seen.latest?.phase).toBe("transitioning");
    const { ends, unsubscribe } = endsOf(frame);

    await act(async () => void client.router.push("/comments"));
    expect(PendingNavigation.get()).toBe("http://localhost/en/comments");

    await drawnWithin(800);
    unsubscribe();
    expect(PendingNavigation.entry()).toBeNull();
    expect(ends).toEqual(["/en/comments"]);
  });
});

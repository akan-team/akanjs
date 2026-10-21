import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { CsrContextType, PathRoute, RouteGuide, TransitionType } from "akanjs/client";
import { Activity, act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { setTestEnv } from "../ui/testHelpers.fixture";

let useCsrValues: typeof import("./useCsrValues").useCsrValues;
let RenderLayer: typeof import("./RenderLayer").RenderLayer;
let client: typeof import("akanjs/client");
let defaultPageState: typeof import("akanjs/client").defaultPageState;

beforeAll(async () => {
  setTestEnv("csrvaluestest");
  ({ useCsrValues } = await import("./useCsrValues"));
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

const pathRouteOf = (segment: string, transition: TransitionType = "none", cache = false): PathRoute =>
  ({
    path: `/:lang/${segment}`,
    pathSegments: ["/", "/:lang", `/${segment}`],
    pageState: { ...defaultPageState, transition, cache },
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
}

const screenRouteOf = ({ segment, transition = "none", guard }: Screen): PathRoute => {
  const view = () => <main>{segment}</main>;
  const mod = (
    guard ? client.page().guard(guard).render(view).toRouteModule() : client.page().render(view).toRouteModule()
  ) as { default: unknown; guard?: unknown };
  return {
    ...pathRouteOf(segment, transition),
    renderPage: { kind: "page", isAsync: true, render: mod.default, guard: mod.guard },
  } as unknown as PathRoute;
};

let unmountFrame: (() => void) | null = null;
afterEach(() => {
  unmountFrame?.();
  unmountFrame = null;
  //? A guard still awaiting when its frame unmounts would otherwise redirect the next test's frame.
  const nowhere = () => undefined;
  client.router.init({
    type: "csr",
    lang: "en",
    router: { push: nowhere, replace: nowhere, back: nowhere, refresh: nowhere },
  });
});

//? Draws each stack entry's page through RenderLayer as CSR.tsx does, so a pending page's guard runs and moves the router.
const mountFrame = (path: string, screens: Screen[]) => {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`http://localhost${path}`);
  const pathRoutes = screens.map(screenRouteOf);
  const routeGuide = guideOf(pathRoutes);
  const seen: { latest?: CsrContextType; shown: string[] } = { shown: [] };
  const Frame = () => {
    const values = useCsrValues(routeGuide, pathRoutes);
    seen.latest = values;
    useEffect(() => {
      const canGoBack = () => values.history.current.idx > 0;
      client.router.init({ type: "csr", lang: "en", router: { ...values.router, canGoBack } });
    }, []);
    useEffect(() => void seen.shown.push(values.location.pathname), [values.location.pathname]);
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
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Frame />));
  unmountFrame = () => act(() => root.unmount());
  return { seen, stack: () => seen.latest?.history.current.locations.map(({ pathname }) => pathname) };
};

const elapse = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

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
    await elapse(500);

    expect(frame.stack()).toEqual(["/en/home", "/en/comments"]);
    expect(frame.seen.latest?.prevLocation?.pathname).toBe("/en/home");
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

import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { CsrContextType, PathRoute, RouteGuide, TransitionType } from "akanjs/client";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { setTestEnv } from "../ui/testHelpers.fixture";

let useCsrValues: typeof import("./useCsrValues").useCsrValues;
let client: typeof import("akanjs/client");
let defaultPageState: typeof import("akanjs/client").defaultPageState;

beforeAll(async () => {
  setTestEnv("csrvaluestest");
  ({ useCsrValues } = await import("./useCsrValues"));
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

const routesOf = (segments: string[], transition?: TransitionType, cached: string[] = []) => {
  const pathRoutes = segments.map((segment) => pathRouteOf(segment, transition, cached.includes(segment)));
  const children = Object.fromEntries(
    pathRoutes.map((pathRoute, idx) => [
      `/${segments[idx]}`,
      { pathSegment: `/${segments[idx]}`, pathRoute, children: {} },
    ]),
  );
  const routeGuide: RouteGuide = {
    pathSegment: "/",
    children: { "/:lang": { pathSegment: "/:lang", children } },
  };
  return { routeGuide, pathRoutes };
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

import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { CsrContextType, PathRoute, RouteGuide, TransitionType } from "akanjs/client";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { setTestEnv } from "../ui/testHelpers.fixture";

let useCsrValues: typeof import("./useCsrValues").useCsrValues;
let defaultPageState: typeof import("akanjs/client").defaultPageState;

beforeAll(async () => {
  setTestEnv("csrvaluestest");
  ({ useCsrValues } = await import("./useCsrValues"));
  ({ defaultPageState } = await import("akanjs/client"));
});

const pathRouteOf = (segment: string, transition: TransitionType = "none"): PathRoute =>
  ({
    path: `/:lang/${segment}`,
    pathSegments: ["/", "/:lang", `/${segment}`],
    pageState: { ...defaultPageState, transition },
    renderPage: {},
    renderRootLayouts: [],
    renderLayouts: [],
  }) as unknown as PathRoute;

const routesOf = (segments: string[], transition?: TransitionType) => {
  const pathRoutes = segments.map((segment) => pathRouteOf(segment, transition));
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

const mountCsr = (path: string, transition?: TransitionType) => {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`http://localhost${path}`);
  const { routeGuide, pathRoutes } = routesOf(["a", "b", "c"], transition);
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

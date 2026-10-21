import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { Location, PathRoute, RouteGuide } from "akanjs/client";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { setTestEnv } from "../ui/testHelpers.fixture";

let useLocation: typeof import("./useLocation").useLocation;

beforeAll(async () => {
  setTestEnv("uselocationtest");
  ({ useLocation } = await import("./useLocation"));
});

const pathRoute = { path: "/:lang/list", pathSegments: ["/", "/:lang", "/list"] } as unknown as PathRoute;
const rootRouteGuide: RouteGuide = {
  pathSegment: "/",
  children: {
    "/:lang": { pathSegment: "/:lang", children: { "/list": { pathSegment: "/list", pathRoute, children: {} } } },
  },
};

const locate = (href: string, guide = rootRouteGuide) => {
  const seen: { getLocation?: (href: string) => Location } = {};
  const Probe = () => {
    seen.getLocation = useLocation({ rootRouteGuide: guide }).getLocation;
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  try {
    return seen.getLocation?.(href);
  } finally {
    act(() => root.unmount());
  }
};

const notFoundRouteOf =
  (path: string, pathSegments: string[]) =>
  (pathname: string): PathRoute =>
    ({ path, pathSegments, pathname }) as unknown as PathRoute;

describe("useLocation", () => {
  test("keeps every value of a repeated query key, an empty one included, in order", () => {
    const location = locate("/en/list?tag=&tag=b&sort=latest#top");

    expect(location?.params).toEqual({ lang: "en" });
    expect(location?.searchParams).toEqual({ tag: ["", "b"], sort: "latest" });
    expect(location?.hash).toBe("top");
  });

  test("draws the not-found of the deepest node a path reaches, with the params of the path down to it", () => {
    const guide: RouteGuide = {
      pathSegment: "/",
      children: {
        "/:lang": {
          pathSegment: "/:lang",
          notFoundRouteOf: notFoundRouteOf("/:lang/*", ["/", "/:lang", "/*"]),
          children: {
            "/list": {
              pathSegment: "/list",
              pathRoute,
              notFoundRouteOf: notFoundRouteOf("/:lang/list/*", ["/", "/:lang", "/list", "/*"]),
              children: {},
            },
          },
        },
      },
    };

    const deep = locate("/en/list/1/edit?tab=a", guide);
    expect(deep?.pathRoute).toMatchObject({ path: "/:lang/list/*", pathname: "/en/list/1/edit" });
    expect(deep?.params).toEqual({ lang: "en" });
    expect(deep?.searchParams).toEqual({ tab: "a" });
    expect(locate("/en/other", guide)?.pathRoute).toMatchObject({ path: "/:lang/*", pathname: "/en/other" });
    expect(locate("/en/list", guide)?.pathRoute).toBe(pathRoute);
  });

  test("still throws for a path no page matches when no not-found is known", () => {
    expect(() => locate("/en/other")).toThrow("Not found: /en/other");
  });
});

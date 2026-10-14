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

const locate = (href: string) => {
  const seen: { getLocation?: (href: string) => Location } = {};
  const Probe = () => {
    seen.getLocation = useLocation({ rootRouteGuide }).getLocation;
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  const location = seen.getLocation?.(href);
  act(() => root.unmount());
  return location;
};

describe("useLocation", () => {
  test("keeps every value of a repeated query key, an empty one included, in order", () => {
    const location = locate("/en/list?tag=&tag=b&sort=latest#top");

    expect(location?.params).toEqual({ lang: "en" });
    expect(location?.searchParams).toEqual({ tag: ["", "b"], sort: "latest" });
    expect(location?.hash).toBe("top");
  });
});

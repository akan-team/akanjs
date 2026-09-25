import { describe, expect, test } from "bun:test";

import { RouteSourceValidator } from "./routeSourceValidator";

const source = `export const wsConnect = false;
export default function Layout() {
  return null;
}
`;

describe("RouteSourceValidator root-layout exports", () => {
  // The generator (implicitRootLayout), the runtime routeTreeBuilder, and the docs all
  // support wsConnect on a root layout, but this validator forgot it, so declaring the
  // documented switch failed typecheck/lint/build with "unsupported export".
  test("accepts wsConnect on a root layout", () => {
    expect(() =>
      RouteSourceValidator.validateRouteSourceExports(source, "/app/page/admin/_layout.tsx", "layout", {
        rootLayout: true,
      }),
    ).not.toThrow();
  });

  test("still rejects wsConnect on a nested layout", () => {
    expect(() =>
      RouteSourceValidator.validateRouteSourceExports(source, "/app/page/admin/users/_layout.tsx", "layout", {
        rootLayout: false,
      }),
    ).toThrow(/unsupported export "wsConnect"/);
  });
});

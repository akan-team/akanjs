import { describe, expect, test } from "bun:test";

import { RouteSourceValidator } from "./routeSourceValidator";

const validate = (source: string, kind: "page" | "layout", rootLayout = false) =>
  RouteSourceValidator.validateRouteSourceExports(source, `page/_${kind}.tsx`, kind, { rootLayout });

describe("RouteSourceValidator", () => {
  test("accepts every root-layout config export the route tree honors", () => {
    const source = [
      "export default function Layout() { return null; }",
      "export const fonts = [];",
      "export const manifest = {};",
      'export const theme = "dark";',
      "export const reconnect = true;",
      "export const wsConnect = true;",
      "export const layoutStyle = {};",
      'export const gaTrackingId = "G-1";',
    ].join("\n");

    expect(() => validate(source, "layout", true)).not.toThrow();
  });

  test("rejects root-layout-only exports on a nested layout and on a page", () => {
    const source = ["export default function Layout() { return null; }", "export const wsConnect = true;"].join("\n");

    expect(() => validate(source, "layout")).toThrow('unsupported export "wsConnect"');
    expect(() => validate(source, "page")).toThrow('unsupported export "wsConnect"');
  });

  test("reads devOnly off pageConfig without evaluating the module", () => {
    const source = [
      "export default function Page() { return null; }",
      "export const pageConfig = { devOnly: true };",
    ].join("\n");

    expect(RouteSourceValidator.validateRouteSourceExports(source, "page/_index.tsx", "page")).toEqual({
      devOnly: true,
    });
  });
});

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

describe("RouteSourceValidator route chains", () => {
  const chain = (source: string, kind: "page" | "layout", pattern: string) =>
    RouteSourceValidator.validateRouteSourceExports(source, `page/${kind}.tsx`, kind, { pattern });

  test("reads params, prompt, apps and devOnly off a page() chain without evaluating it", () => {
    const source = [
      'import { page } from "akanjs/client";',
      "export default page()",
      '  .param("projectId", ID, { desc: "The project." })',
      '  .search("status", String)',
      "  .config({ transition: 'stack', devOnly: true })",
      '  .prompt("briefProject", "Brief one project.")',
      '  .app("showProject", "Show one project.", ({ projectId }) => null)',
      '  .app("showBoard", "Show its board.", ({ projectId }) => null)',
      "  .render(async ({ projectId, showProject }) => showProject);",
    ].join("\n");
    expect(chain(source, "page", "/:lang/project/:projectId")).toEqual({
      devOnly: true,
      chain: { kind: "page", params: ["projectId"], prompt: "briefProject", apps: ["showProject", "showBoard"] },
    });
  });

  test("names a [segment] the page did not declare and a .param() the path lacks", () => {
    expect(() => chain("export default page().render(() => null);", "page", "/:lang/org/:orgId")).toThrow(
      'sits under [orgId] but declares no .param("orgId")',
    );
    expect(() => chain('export default page().param("orgId", ID).render(() => null);', "page", "/:lang/org")).toThrow(
      'declares .param("orgId") but no [orgId] segment is in its path',
    );
    expect(() =>
      chain('export default page().param("lang", String).render(() => null);', "page", "/:lang/org"),
    ).toThrow('declares .param("lang"), which every route receives undeclared');
    // A layout may leave a segment undeclared.
    expect(() =>
      chain("export default layout().render(({ children }) => children);", "layout", "/:lang/org/:orgId"),
    ).not.toThrow();
  });

  test("refuses named exports beside a chain, a chain in the wrong file kind, and a computed name", () => {
    expect(() =>
      chain(["export default page().render(() => null);", "export const pageConfig = {};"].join("\n"), "page", "/"),
    ).toThrow("exports pageConfig beside its page() chain");
    expect(() => chain("export default layout().render(() => null);", "page", "/")).toThrow(
      "is a page file but exports layout()",
    );
    expect(() => chain("export default page().render(() => null);", "layout", "/")).toThrow(
      "is a layout file but exports page()",
    );
    expect(() => chain("export default page().param(name, ID).render(() => null);", "page", "/:lang/:x")).toThrow(
      ".param() takes a string literal first",
    );
    expect(() => chain('export default page().app(name, "x", () => null).render(() => null);', "page", "/")).toThrow(
      ".app() takes a string literal first",
    );
    expect(() => chain("export default page().config({ devOnly: flag }).render(() => null);", "page", "/")).toThrow(
      "devOnly must be a literal true or false",
    );
    const indirect = [
      'const memo = page().app("showMemo", "x", () => null).render(() => null);',
      "export default memo;",
    ];
    expect(() => chain(indirect.join("\n"), "page", "/")).toThrow('exports its chain through "memo"');
    const renamed = [indirect[0], "export { memo as default };"];
    expect(() => chain(renamed.join("\n"), "page", "/")).toThrow('exports its chain through "memo"');
  });

  test("still reads the legacy shape as before, which never takes a guard", () => {
    const source = [
      "export default function Page() { return null; }",
      "export const pageConfig = { devOnly: false };",
    ].join("\n");
    expect(chain(source, "page", "/")).toEqual({ devOnly: false });
    expect(() => chain(`${source}\nexport const guard = async () => undefined;`, "page", "/")).toThrow(
      "exports guard beside a legacy default",
    );
  });
});

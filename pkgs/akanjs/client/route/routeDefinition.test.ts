import { describe, expect, test } from "bun:test";
import { enumOf, ID, Int } from "akanjs/base";
import { parseAkanI18nEnv } from "akanjs/common";
import type { LayoutModule, PageModule, PageProps } from "../csrTypes";
import { AkanNotFoundError } from "../router";
import { RouteDefinition } from "./RouteDefinition";
import { isRouteDefinition, resolveRouteModule } from "./resolveRouteModule";
import { RouteArgError } from "./routeArgs";
import { layout, page, rootLayout } from "./routeBuilders";

class Period extends enumOf("routeTestPeriod", ["day", "month"] as const) {}

const props = (params: Record<string, string>, searchParams: Record<string, string | string[]> = {}): PageProps => ({
  params,
  searchParams,
});
// `ID` refuses anything but a document id, so the fixture carries a real-looking one.
const pid = "507f1f77bcf86cd799439011";

describe("page() chain", () => {
  test("unfolds into the module shape every loader reads, with typed arguments", async () => {
    const seen: unknown[] = [];
    const definition = page()
      .param("projectId", ID)
      .search("page", Int)
      .search("tags", [String])
      .search("period", Period)
      .config({ transition: "stack" })
      .head(({ projectId }) => `head:${projectId}`)
      .loading(({ projectId }) => `loading:${projectId}`)
      .render(async (args) => {
        seen.push(args);
        return `page:${args.projectId}:${args.page ?? "-"}:${(args.tags ?? []).join("|")}:${args.period ?? "-"}`;
      });
    const { module, definition: resolved } = resolveRouteModule(
      { default: definition } as never,
      "./p/[projectId].tsx",
      {
        kind: "page",
        pattern: "/:lang/p/:projectId",
      },
    );
    expect(resolved).toBe(definition);
    const mod = module as PageModule;
    expect(mod.pageConfig).toEqual({ transition: "stack" });
    expect(mod.head).toBeUndefined();
    expect(await mod.generateHead?.(props({ projectId: pid, lang: "en" }))).toBe(`head:${pid}`);
    expect(mod.Loading?.({ params: { projectId: pid } })).toBe(`loading:${pid}`);
    expect(await mod.default?.(props({ projectId: pid, lang: "en" }, { page: "3", tags: "a", period: "day" }))).toBe(
      `page:${pid}:3:a:day`,
    );
    expect(await mod.default?.(props({ projectId: pid }, { tags: ["a", "b"] }))).toBe(`page:${pid}:-:a|b:-`);
    expect(seen[0]).toEqual({ lang: "en", projectId: pid, page: 3, tags: ["a"], period: "day" });
  });

  test("hands the locale segment to every stage as lang, and refuses a stage that declares it", async () => {
    const mod = page()
      .head(({ lang }) => `head:${lang}`)
      .loading(({ lang }) => `loading:${lang}`)
      .render(({ lang }) => `page:${lang}`)
      .toRouteModule();
    expect(await mod.default?.(props({ lang: "ko" }))).toBe("page:ko");
    expect(await mod.generateHead?.(props({ lang: "ko" }))).toBe("head:ko");
    expect(mod.Loading?.({ params: {} })).toBe(`loading:${parseAkanI18nEnv().defaultLocale}`);
    expect(() => page().param("lang", String)).toThrow('receives "lang" on every route');
    expect(() => layout().search("lang", String)).toThrow('receives "lang" on every route');
  });

  test("keeps its render function across unfoldings until a stage changes, so a module swap re-renders only its own layer", () => {
    const definition = page().search("id", String);
    const first = definition.render(({ id }) => `a:${id}`).toRouteModule().default;
    expect(definition.toRouteModule().default).toBe(first);
    expect(definition.render(({ id }) => `b:${id}`).toRouteModule().default).not.toBe(first);
  });

  test("answers not-found for a path value the type refuses and drops a bad search value", async () => {
    const mod = page()
      .param("count", Int)
      .search("period", Period)
      .render(({ count, period }) => `${count}:${period ?? "-"}`)
      .toRouteModule();
    expect(await mod.default?.(props({ count: "3" }, { period: "year" }))).toBe("3:-");
    await expect(mod.default?.(props({ count: "three" }))).rejects.toBeInstanceOf(AkanNotFoundError);
  });

  test("is strict about a prompt's arguments: comma-separated lists, refusals by name", () => {
    const definition = page()
      .param("projectId", ID)
      .search("statuses", [String])
      .search("period", Period)
      .render(() => null);
    expect(
      definition.resolveArgs(
        { params: { projectId: pid }, searchParams: { statuses: "open, done,,late" } },
        { strict: true },
      ),
    ).toEqual({ projectId: pid, statuses: ["open", "done", "late"] });
    expect(() => definition.resolveArgs({ params: {}, searchParams: {} }, { strict: true })).toThrow(
      'Missing required argument "projectId".',
    );
    expect(() =>
      definition.resolveArgs({ params: { projectId: pid }, searchParams: { period: "year" } }, { strict: true }),
    ).toThrow(RouteArgError);
    expect(() =>
      definition.resolveArgs({ params: { projectId: pid }, searchParams: { period: "year" } }, { strict: true }),
    ).toThrow('Invalid argument "period": expected one of day, month.');
  });

  test("publishes a prompt from its own declaration, lists marked comma-separated", () => {
    const definition = page()
      .param("projectId", ID, { desc: "The project to brief." })
      .search("statuses", [String], { desc: "Ticket statuses to include." })
      .search("period", Period)
      .prompt("briefProjectTickets", "Brief the ticket board of one project.")
      .render(() => null);
    expect(definition.promptMeta).toEqual({
      name: "briefProjectTickets",
      description: "Brief the ticket board of one project.",
      arguments: [
        { name: "projectId", description: "The project to brief.", required: true },
        { name: "statuses", description: "Ticket statuses to include. Comma-separated list.", required: false },
        { name: "period", required: false },
      ],
    });
    expect(page().render(() => null).promptMeta).toBeUndefined();
    expect(() => page().prompt("has space", "x")).toThrow("must match");
    expect(() => page().prompt("ok", "  ")).toThrow("needs a description");
  });

  test("names a declared param the path lacks, and a path segment the page did not declare", () => {
    expect(() =>
      resolveRouteModule(
        {
          default: page()
            .param("orgId", ID)
            .render(() => null),
        } as never,
        "./org/_index.tsx",
        {
          kind: "page",
          pattern: "/:lang/org",
        },
      ),
    ).toThrow('declares .param("orgId") but no [orgId] segment is in its path');
    expect(() =>
      resolveRouteModule({ default: page().render(() => null) } as never, "./org/[orgId]/_index.tsx", {
        kind: "page",
        pattern: "/:lang/org/:orgId",
      }),
    ).toThrow('sits under [orgId] but declares no .param("orgId")');
    expect(() =>
      resolveRouteModule(
        { default: layout().render(({ children }) => children) } as never,
        "./org/[orgId]/_layout.tsx",
        {
          kind: "layout",
          pattern: "/:lang/org/:orgId",
        },
      ),
    ).not.toThrow();
  });

  test("refuses a chain beside named exports, in the wrong file kind, or without .render()", () => {
    const chain = page().render(() => null);
    expect(() => resolveRouteModule({ default: chain, pageConfig: {} } as never, "./a.tsx")).toThrow(
      "exports pageConfig beside its page() chain",
    );
    expect(() => resolveRouteModule({ default: chain } as never, "./_layout.tsx", { kind: "layout" })).toThrow(
      "is a layout file but exports page()",
    );
    expect(() =>
      resolveRouteModule({ default: layout().render(() => null) } as never, "./a.tsx", { kind: "page" }),
    ).toThrow("is a page file but exports layout()");
    expect(() => resolveRouteModule({ default: page() } as never, "./a.tsx")).toThrow("ends with .render()");
    expect(() => page().param("id", ID).param("id", ID)).toThrow('declares "id" twice');
  });

  test("passes a legacy module through untouched", () => {
    const legacy = { default: () => null, pageConfig: { transition: "fade" as const } };
    const resolved = resolveRouteModule(legacy as never, "./legacy.tsx", { kind: "page" });
    expect(resolved.module).toBe(legacy as never);
    expect(resolved.definition).toBeUndefined();
    expect(isRouteDefinition(legacy.default)).toBe(false);
  });
});

describe("layout() and rootLayout() chains", () => {
  test("hand children through and carry the layout-only stages", async () => {
    const notFound = () => "nf";
    const mod = layout()
      .notFound(notFound)
      .render(({ lang, children }) => ["wrap", lang, children])
      .toRouteModule() as LayoutModule;
    expect(await mod.default?.({ params: { lang: "ko" }, searchParams: {}, children: "inner" })).toEqual([
      "wrap",
      "ko",
      "inner",
    ]);
    expect(mod.NotFound).toBe(notFound);
    expect(mod.Error).toBeUndefined();
  });

  test("a root layout carries what only the generated root layout reads", () => {
    const fonts = [{ name: "sans", default: true, paths: [] }];
    const mod = rootLayout()
      .fonts(fonts as never)
      .theme("dark")
      .wsConnect(false)
      .head("head")
      .render(({ children }) => children)
      .toRouteModule() as LayoutModule;
    expect(mod.fonts).toBe(fonts as never);
    expect(mod.theme).toBe("dark");
    expect(mod.wsConnect).toBe(false);
    expect(mod.reconnect).toBeUndefined();
    expect(mod.head).toBe("head");
    expect(
      resolveRouteModule({ default: rootLayout().render(() => null) } as never, "./_layout.tsx", { kind: "layout" })
        .definition?.kind,
    ).toBe("rootLayout");
  });
});

describe("RouteDefinition.renderArgsKey", () => {
  const keyOf = (render: unknown, args: PageProps, option: { isPage: boolean; paramNames?: string[] }) =>
    RouteDefinition.renderArgsKey(render, args, option);

  test("a chain's render changes with its declared args and lang, and with nothing else", () => {
    const { default: render } = page()
      .param("projectId", ID)
      .search("tab", String)
      .render(() => null)
      .toRouteModule() as PageModule;
    const base = keyOf(render, props({ lang: "en", projectId: pid }, { tab: "a", utm: "x" }), { isPage: true });
    expect(keyOf(render, props({ lang: "en", projectId: pid }, { tab: "a", utm: "y" }), { isPage: true })).toBe(base);
    expect(keyOf(render, props({ lang: "en", projectId: pid }, { tab: "b" }), { isPage: true })).not.toBe(base);
    expect(keyOf(render, props({ lang: "ko", projectId: pid }, { tab: "a" }), { isPage: true })).not.toBe(base);
  });

  test("a chain layout that declares nothing keeps its output across pages and queries", () => {
    const { default: render } = layout()
      .render(({ children }) => children)
      .toRouteModule() as LayoutModule;
    expect(keyOf(render, props({ lang: "en", id: "1" }, { q: "1" }), { isPage: false })).toBe(
      keyOf(render, props({ lang: "en", id: "2" }, { q: "2" }), { isPage: false }),
    );
  });

  test("a legacy page reads every search value; a legacy layout reads only the params of its own path", () => {
    const legacy = async () => null;
    const page1 = keyOf(legacy, props({ lang: "en" }, { q: "1" }), { isPage: true });
    expect(keyOf(legacy, props({ lang: "en" }, { q: "2" }), { isPage: true })).not.toBe(page1);
    const layoutKey = (params: Record<string, string>, search: Record<string, string>) =>
      keyOf(legacy, props(params, search), { isPage: false, paramNames: ["lang", "orgId"] });
    expect(layoutKey({ lang: "en", orgId: "o1", id: "1" }, { q: "1" })).toBe(
      layoutKey({ lang: "en", orgId: "o1", id: "2" }, { q: "2" }),
    );
    expect(layoutKey({ lang: "en", orgId: "o2", id: "1" }, {})).not.toBe(
      layoutKey({ lang: "en", orgId: "o1", id: "1" }, {}),
    );
  });
});

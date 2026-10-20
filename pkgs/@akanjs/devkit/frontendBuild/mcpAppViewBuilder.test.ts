import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { McpAppViewBuilder } from "./mcpAppViewBuilder";

const makeTempRoot = tempDirs("akan-mcp-app-views-");

const memoPage = [
  'import { page } from "akanjs/client";',
  "export default page()",
  '  .param("memoId", ID)',
  '  .app("showMemo", "Show one memo.", ({ memoId }) => null)',
  '  .app("showMemoImages", "Show its images.", ({ memoId }) => null)',
  "  .render(() => null);",
].join("\n");

describe("McpAppViewBuilder.discover", () => {
  test("finds each app of each page, under the root layout that renders the system provider", async () => {
    const appRoot = await makeTempRoot();
    const file = (rel: string) => path.join(appRoot, rel);
    await write(file("generated/__root_layout.tsx"), "export function McpAppRoot() {}\n");
    await write(file("generated/(home)/__root_layout.tsx"), "export const guard = userLayout.guard;\n");
    await write(file("page/(home)/memo/[memoId].tsx"), memoPage);
    await write(
      file("page/admin/report.tsx"),
      'export default page().app("showReport", "Show the report.", () => null).render(() => null);',
    );
    await write(file("page/plain.tsx"), "export default page().render(() => null);");
    const entries = [
      { key: "./__root_layout.tsx", moduleAbsPath: file("generated/__root_layout.tsx") },
      { key: "./(home)/__root_layout.tsx", moduleAbsPath: file("generated/(home)/__root_layout.tsx") },
      { key: "./(home)/memo/[memoId].tsx", moduleAbsPath: file("page/(home)/memo/[memoId].tsx") },
      { key: "./admin/report.tsx", moduleAbsPath: file("page/admin/report.tsx") },
      { key: "./plain.tsx", moduleAbsPath: file("page/plain.tsx") },
    ];
    const views = await McpAppViewBuilder.discover(entries, ["admin"]);
    expect(views.map(({ name, page, root, basePath }) => [name, page.key, root?.key, basePath])).toEqual([
      ["showMemo", "./(home)/memo/[memoId].tsx", "./__root_layout.tsx", ""],
      ["showMemoImages", "./(home)/memo/[memoId].tsx", "./__root_layout.tsx", ""],
      ["showReport", "./admin/report.tsx", "./__root_layout.tsx", "admin"],
    ]);
  });

  test("takes the overrides over each page by route, outermost first, and none from a sibling group", async () => {
    const appRoot = await makeTempRoot();
    const file = (rel: string) => path.join(appRoot, rel);
    await write(file("page/(home)/memo.tsx"), memoPage);
    const entries = [
      { key: "./(home)/memo.tsx", moduleAbsPath: file("page/(home)/memo.tsx") },
      { key: "./(home)/memo/_overrides.tsx", moduleAbsPath: file("generated/memo_overrides.tsx") },
      { key: "./_overrides.tsx", moduleAbsPath: file("generated/_overrides.tsx") },
      { key: "./(home)/_overrides.tsx", moduleAbsPath: file("generated/home_overrides.tsx") },
      { key: "./(tab)/_overrides.tsx", moduleAbsPath: file("generated/tab_overrides.tsx") },
    ];
    const [view] = await McpAppViewBuilder.discover(entries, []);
    expect(view?.rootOverrides).toEqual([]);
    expect(view?.overrides.map((entry) => entry.key)).toEqual([
      "./_overrides.tsx",
      "./(home)/_overrides.tsx",
      "./(home)/memo/_overrides.tsx",
    ]);
  });

  test("puts the overrides on the root layout's node and above it outside that layout, as the route tree does", async () => {
    const appRoot = await makeTempRoot();
    const file = (rel: string) => path.join(appRoot, rel);
    await write(file("generated/(home)/__root_layout.tsx"), "export function McpAppRoot() {}\n");
    await write(file("page/(home)/memo.tsx"), memoPage);
    const entries = [
      { key: "./(home)/__root_layout.tsx", moduleAbsPath: file("generated/(home)/__root_layout.tsx") },
      { key: "./(home)/memo.tsx", moduleAbsPath: file("page/(home)/memo.tsx") },
      { key: "./(home)/memo/_overrides.tsx", moduleAbsPath: file("generated/memo_overrides.tsx") },
      { key: "./(home)/_overrides.tsx", moduleAbsPath: file("generated/home_overrides.tsx") },
      { key: "./_overrides.tsx", moduleAbsPath: file("generated/_overrides.tsx") },
    ];
    const [view] = await McpAppViewBuilder.discover(entries, []);
    expect(view?.root?.key).toBe("./(home)/__root_layout.tsx");
    expect(view?.rootOverrides.map((entry) => entry.key)).toEqual(["./_overrides.tsx", "./(home)/_overrides.tsx"]);
    expect(view?.overrides.map((entry) => entry.key)).toEqual(["./(home)/memo/_overrides.tsx"]);
  });

  test("keeps an override inside the root layout when its folder holds a layout above the root's", async () => {
    const appRoot = await makeTempRoot();
    const file = (rel: string) => path.join(appRoot, rel);
    await write(file("generated/oauth/__root_layout.tsx"), "export function McpAppRoot() {}\n");
    await write(file("page/(libs)/(shared)/oauth/consent.tsx"), memoPage);
    const entries = [
      { key: "./(libs)/(shared)/oauth/__root_layout.tsx", moduleAbsPath: file("generated/oauth/__root_layout.tsx") },
      { key: "./(libs)/(shared)/_layout.tsx", moduleAbsPath: file("page/(libs)/(shared)/_layout.tsx") },
      { key: "./(libs)/(shared)/oauth/consent.tsx", moduleAbsPath: file("page/(libs)/(shared)/oauth/consent.tsx") },
      { key: "./(libs)/(shared)/oauth/_overrides.tsx", moduleAbsPath: file("generated/oauth_overrides.tsx") },
      { key: "./(libs)/(shared)/_overrides.tsx", moduleAbsPath: file("generated/shared_overrides.tsx") },
      { key: "./_overrides.tsx", moduleAbsPath: file("generated/_overrides.tsx") },
    ];
    const [view] = await McpAppViewBuilder.discover(entries, []);
    expect(view?.rootOverrides.map((entry) => entry.key)).toEqual([
      "./_overrides.tsx",
      "./(libs)/(shared)/oauth/_overrides.tsx",
    ]);
    expect(view?.overrides.map((entry) => entry.key)).toEqual(["./(libs)/(shared)/_overrides.tsx"]);
  });

  test("names two pages that claim one app, and a page with no root layout to provide for it", async () => {
    const appRoot = await makeTempRoot();
    const file = (rel: string) => path.join(appRoot, rel);
    await write(file("page/a.tsx"), memoPage);
    await write(file("page/b.tsx"), memoPage);
    const entries = [
      { key: "./a.tsx", moduleAbsPath: file("page/a.tsx") },
      { key: "./b.tsx", moduleAbsPath: file("page/b.tsx") },
    ];
    await expect(McpAppViewBuilder.discover(entries, [])).rejects.toThrow(
      'app "showMemo" is declared by both ./a.tsx and ./b.tsx',
    );
    const [view] = await McpAppViewBuilder.discover(entries.slice(0, 1), []);
    expect(view?.root).toBeNull();
  });

  test("refuses a name MCP would not list, and two that differ only in case", async () => {
    const appRoot = await makeTempRoot();
    const file = (rel: string) => path.join(appRoot, rel);
    await write(file("page/a.tsx"), memoPage);
    await write(file("page/b.tsx"), memoPage.replace('"showMemo"', '"ShowMemo"'));
    await write(file("page/c.tsx"), memoPage.replace('"showMemo"', '"../showMemo"'));
    const entryOf = (name: string) => ({ key: `./${name}.tsx`, moduleAbsPath: file(`page/${name}.tsx`) });
    await expect(McpAppViewBuilder.discover([entryOf("a"), entryOf("b")], [])).rejects.toThrow(
      'apps "showMemo" (./a.tsx) and "ShowMemo" (./b.tsx) differ only in case',
    );
    await expect(McpAppViewBuilder.discover([entryOf("c")], [])).rejects.toThrow(
      'app name "../showMemo" in ./c.tsx must match',
    );
  });
});

describe("McpAppViewBuilder.entryOf", () => {
  test("boots the one app with its page, the root layout and overrides it sits under, by relative path", () => {
    const view = {
      name: "showMemo",
      page: { key: "./memo/[memoId].tsx", moduleAbsPath: "/app/page/memo/[memoId].tsx" },
      root: { key: "./__root_layout.tsx", moduleAbsPath: "/app/.akan/generated/root-layouts/__root_layout.tsx" },
      rootOverrides: [{ key: "./_overrides.tsx", moduleAbsPath: "/app/.akan/generated/overrides/_overrides.tsx" }],
      overrides: [{ key: "./memo/_overrides.tsx", moduleAbsPath: "/app/.akan/generated/overrides/memo.tsx" }],
      basePath: "admin",
    };
    expect(McpAppViewBuilder.entryOf(view, "/app/.akan/generated/mcp-apps")).toBe(
      [
        'import { McpAppBoot } from "akanjs/webkit";',
        'import * as page from "../../../page/memo/[memoId].tsx";',
        'import * as root from "../root-layouts/__root_layout.tsx";',
        'import rootOverride0 from "../overrides/_overrides.tsx";',
        'import override0 from "../overrides/memo.tsx";',
        "void McpAppBoot.run({",
        '  app: "showMemo",',
        "  page,",
        "  root,",
        "  rootOverrides: [rootOverride0],",
        "  overrides: [override0],",
        '  basePath: "admin",',
        "});",
        "",
      ].join("\n"),
    );
    expect(
      McpAppViewBuilder.entryOf(
        { ...view, root: null, rootOverrides: [], overrides: [] },
        "/app/.akan/generated/mcp-apps",
      ),
    ).toContain("const root = {};\nvoid McpAppBoot.run({");
  });
});

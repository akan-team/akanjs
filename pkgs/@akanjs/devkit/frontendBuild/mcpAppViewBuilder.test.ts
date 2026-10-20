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
});

describe("McpAppViewBuilder.entryOf", () => {
  test("boots the one app with its page and the root layout it sits under, by relative path", () => {
    const view = {
      name: "showMemo",
      page: { key: "./memo.tsx", moduleAbsPath: "/app/page/memo.tsx" },
      root: { key: "./__root_layout.tsx", moduleAbsPath: "/app/.akan/generated/root-layouts/__root_layout.tsx" },
      basePath: "",
    };
    expect(McpAppViewBuilder.entryOf(view, "/app/.akan/generated/mcp-apps")).toBe(
      [
        'import { McpAppBoot } from "akanjs/webkit";',
        'import * as page from "../../../page/memo.tsx";',
        'import * as root from "../root-layouts/__root_layout.tsx";',
        'void McpAppBoot.run({ app: "showMemo", page, root });',
        "",
      ].join("\n"),
    );
    expect(McpAppViewBuilder.entryOf({ ...view, root: null }, "/app/.akan/generated/mcp-apps")).toContain(
      "const root = {};",
    );
  });
});

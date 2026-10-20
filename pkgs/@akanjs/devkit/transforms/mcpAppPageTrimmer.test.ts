import { describe, expect, test } from "bun:test";
import { symlink } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText } from "../testHelpers";
import { McpAppPageTrimmer } from "./mcpAppPageTrimmer";

const makeTempRoot = tempDirs("akan-mcp-app-trim-");

describe("McpAppPageTrimmer", () => {
  test("hands every stage but the apps a function that draws nothing, and keeps the rest of the chain as written", () => {
    const source = [
      'import { fetch, Memo } from "@apps/minimal/client";',
      'import { Screen } from "@apps/minimal/ui";',
      "export default page()",
      '  .param("memoId", ID)',
      "  .config({ topInset: 48 })",
      "  .guard(async ({ memoId }) => { await fetch.memo(memoId); })",
      "  .head(<title>Memo</title>)",
      "  .loading(() => <Screen>loading</Screen>)",
      '  .app("showMemo", "Show one memo.", ({ memoId }) => <Memo.Zone.View view={fetch.viewMemo(memoId).memoView} />)',
      "  .render(({ memoId, showMemo }) => (",
      '    <Screen className="pb-10">{showMemo}</Screen>',
      "  ));",
    ].join("\n");
    expect(McpAppPageTrimmer.trim(source, "memo.tsx")).toBe(
      [
        'import { fetch, Memo } from "@apps/minimal/client";',
        'import { Screen } from "@apps/minimal/ui";',
        "export default page()",
        '  .param("memoId", ID)',
        "  .config({ topInset: 48 })",
        "  .guard(() => null)",
        "  .head(() => null)",
        "  .loading(() => null)",
        '  .app("showMemo", "Show one memo.", ({ memoId }) => <Memo.Zone.View view={fetch.viewMemo(memoId).memoView} />)',
        "  .render(() => null);",
      ].join("\n"),
    );
  });

  test("trims a page reached through a link, as a synced lib page is", async () => {
    const root = await makeTempRoot();
    await writeText(
      path.join(root, "libs/shared/page/login.tsx"),
      [
        "const page = () => ({ render: (draw: () => string) => draw });",
        'export default page().render(() => "drawn by the render");',
      ].join("\n"),
    );
    await symlink(path.join(root, "libs/shared/page"), path.join(root, "linked"));
    await writeText(path.join(root, "entry.ts"), 'import login from "./linked/login.tsx";\nexport { login };\n');
    const result = await Bun.build({
      entrypoints: [path.join(root, "entry.ts")],
      plugins: [McpAppPageTrimmer.plugin([path.join(root, "linked/login.tsx")])],
    });
    const [output] = result.outputs;
    expect(result.success).toBe(true);
    expect(await output?.text()).not.toContain("drawn by the render");
  });

  test("drops a lazy component only the page's render drew, with what it imports", async () => {
    const root = await makeTempRoot();
    await writeText(path.join(root, "Globe.ts"), 'export default "a heavy globe";\n');
    await writeText(
      path.join(root, "trip.tsx"),
      [
        "const lazy = (load: () => Promise<unknown>) => ({ load });",
        'const Globe = lazy(() => import("./Globe"));',
        "const page = () => ({ app: (name: string, draw: () => unknown) => ({ render: (render: () => unknown) => [name, draw, render] }) });",
        'export default page().app("showTrip", () => "a trip card").render(() => Globe);',
      ].join("\n"),
    );
    await writeText(path.join(root, "entry.ts"), 'import trip from "./trip.tsx";\nconsole.info(trip);\n');
    const result = await Bun.build({
      entrypoints: [path.join(root, "entry.ts")],
      plugins: [McpAppPageTrimmer.plugin([path.join(root, "trip.tsx")])],
      splitting: false,
    });
    const text = (await result.outputs[0]?.text()) ?? "";
    expect(result.success).toBe(true);
    expect(text).toContain("a trip card");
    expect(text).not.toContain("a heavy globe");
  });

  test("leaves a module with no chain as it is", () => {
    const legacy = "export default function Page() { return <main />; }\nexport const pageConfig = {};";
    expect(McpAppPageTrimmer.trim(legacy, "legacy.tsx")).toBe(legacy);
  });
});

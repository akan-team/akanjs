import { describe, expect, test } from "bun:test";
import { McpAppPageTrimmer } from "./mcpAppPageTrimmer";

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

  test("leaves a module with no chain as it is", () => {
    const legacy = "export default function Page() { return <main />; }\nexport const pageConfig = {};";
    expect(McpAppPageTrimmer.trim(legacy, "legacy.tsx")).toBe(legacy);
  });
});

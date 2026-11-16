import { describe, expect, test } from "bun:test";
import { RuntimeScopeReport } from "./runtimeScopeReport";

describe("RuntimeScopeReport", () => {
  test("counts a file a browser page may load, not a server, generated, test or module convention file", () => {
    const clientFile = '"use client";\nexport const A = () => null;\n';
    const serverPage = "export default function Page() { return null; }\n";
    expect(
      [
        ["apps/demo/ui/Card.tsx", serverPage],
        ["apps/demo/lib/memo/Memo.Zone.tsx", serverPage],
        ["apps/demo/page/_index.tsx", clientFile],
        ["apps/demo/page/_index.tsx", serverPage],
        ["apps/demo/lib/memo/memo.store.ts", clientFile],
        ["apps/demo/lib/st.ts", clientFile],
        ["apps/demo/ui/index.ts", clientFile],
        ["apps/demo/srvkit/token.ts", clientFile],
        ["apps/demo/ui/Card.test.tsx", clientFile],
        ["apps/demo/akan.config.ts", clientFile],
        ["pkgs/akanjs/ui/Card.tsx", clientFile],
      ].map(([file = "", text = ""]) => RuntimeScopeReport.isClientFile(file, text)),
    ).toEqual([true, true, true, false, false, false, false, false, false, false, false]);
  });

  test("prints a note per file that loads its scope's whole runtime, then one line per scope", () => {
    const summary = {
      scope: "apps/demo",
      table: true,
      tableMs: 12.4,
      clientFiles: 40,
      readers: 6,
      resolvable: 5,
      wholeScope: 1,
      analysisMs: 3.2,
      slowestFile: { file: "apps/demo/ui/Card.tsx", ms: 1.26 },
      approximations: [],
    };
    const note = {
      file: "apps/demo/ui/Card.tsx",
      scope: "apps/demo",
      reason: "passed-on" as const,
      line: 4,
      column: 30,
      text: "fetch",
      message: "`fetch`: the names read from it where it goes are not visible here",
    };
    expect(
      RuntimeScopeReport.format({
        scopes: [summary, { ...summary, scope: "apps/bare", table: false }],
        notes: [note],
      }).split("\n"),
    ).toEqual([
      "apps/demo/ui/Card.tsx:4:30 - note akan.runtime.whole-scope: `fetch`: the names read from it where it goes are not visible here. The file works; a page that loads it loads apps/demo's whole client runtime.",
      "",
      "apps/demo: 6 of 40 client files read the runtime, 5 per module, 1 whole (table 12ms, analysis 3ms, slowest file 1.3ms)",
      "apps/bare: no generated client runtime to read (run akan sync); table 12ms, analysis 3ms",
    ]);
  });
});

import { describe, expect, test } from "bun:test";
import { ObjectImportReport } from "./objectImportReport";

describe("ObjectImportReport.format", () => {
  test("prints one line per scope with its reasons by count, and where the files are listed", () => {
    const kept = {
      file: "apps/demo/page/_index.tsx",
      line: 3,
      object: "Scroll",
      objectFile: "libs/util/ui/Scroll/index.tsx",
    };

    expect(
      ObjectImportReport.format({
        scopes: [
          {
            scope: "apps/demo",
            app: "demo",
            narrowed: 12,
            kept: 4,
            reasons: { call: 1, "rendered-or-called": 2, "passed-on": 1 },
          },
          { scope: "libs/util", app: "demo", narrowed: 3, kept: 0, reasons: {} },
        ],
        kept: [{ ...kept, reason: "rendered-or-called" }],
      }),
    ).toBe(
      [
        "apps/demo: 12 object imports load only the members they name, 4 load the whole object (rendered-or-called 2, call 1, passed-on 1)",
        "libs/util: 3 object imports load only the members they name, 0 load the whole object",
        "--format json lists each import that loads the whole object, with its file and line",
      ].join("\n"),
    );
    expect(ObjectImportReport.format({ scopes: [], kept: [] })).toBe("");
  });
});

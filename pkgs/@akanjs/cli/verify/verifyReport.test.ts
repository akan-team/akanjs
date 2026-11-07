import { describe, expect, test } from "bun:test";
import type { VerifyDiagnostic } from "./verifyDiagnostics";
import { VerifyReport, type VerifyResult } from "./verifyReport";

const diagnosticOf = (overrides: Partial<VerifyDiagnostic>): VerifyDiagnostic => ({
  step: "typecheck",
  file: "apps/minimal/lib/memo/memo.constant.ts",
  line: 21,
  col: 14,
  code: "TS2322",
  severity: "error",
  message: "Type 'string' is not assignable to type 'number'.",
  ...overrides,
});

const resultOf = (overrides: Partial<VerifyResult>): VerifyResult => ({
  ok: true,
  targets: ["minimal"],
  ms: 5800,
  steps: [
    { name: "sync", status: "pass", ms: 100, fixed: 0 },
    { name: "lint", status: "pass", ms: 700, fixed: 0 },
    { name: "typecheck", status: "pass", ms: 5000, fixed: 0 },
    { name: "build", status: "pass", ms: 2000, fixed: 0 },
  ],
  diagnostics: [],
  ...overrides,
});

describe("VerifyReport", () => {
  test("a clean run is one line", () => {
    expect(VerifyReport.text(resultOf({}))).toBe("verify ok · minimal · lint typecheck build · 5.8s");
  });

  test("nothing changed is one line", () => {
    expect(VerifyReport.text(resultOf({ targets: [], steps: [] }))).toBe(
      "verify ok · nothing changed under apps/, libs/ or pkgs/",
    );
  });

  test("a failure names each step's state, then one line per diagnostic, errors first", () => {
    const text = VerifyReport.text(
      resultOf({
        ok: false,
        steps: [
          { name: "sync", status: "pass", ms: 100, fixed: 0 },
          { name: "lint", status: "fail", ms: 700, fixed: 2 },
          { name: "typecheck", status: "fail", ms: 5000, fixed: 0 },
          { name: "build", status: "skip", ms: 0, fixed: 0 },
        ],
        diagnostics: [
          diagnosticOf({ step: "lint", severity: "warning", code: "lint/suspicious/noExplicitAny", message: "any" }),
          diagnosticOf({ step: "lint", file: "apps/minimal/main.ts", line: 2, col: 3, code: "lint/x", message: "x" }),
          diagnosticOf({}),
        ],
      }),
    );
    expect(text.split("\n")).toEqual([
      "verify fail · minimal · lint 1 error · typecheck 1 error · build skipped · fixed 2 files · 5.8s",
      "apps/minimal/main.ts:2:3 lint/x x",
      "apps/minimal/lib/memo/memo.constant.ts:21:14 TS2322 Type 'string' is not assignable to type 'number'.",
      "apps/minimal/lib/memo/memo.constant.ts:21:14 warning lint/suspicious/noExplicitAny any",
    ]);
  });

  test("groups one problem repeated across files and caps the listing", () => {
    const diagnostics = [
      diagnosticOf({ file: "apps/a.ts" }),
      diagnosticOf({ file: "apps/a.ts", line: 30 }),
      diagnosticOf({ file: "apps/b.ts" }),
      diagnosticOf({ file: "apps/c.ts" }),
      ...Array.from({ length: 25 }, (_, idx) => diagnosticOf({ code: `TS${idx}`, message: `m${idx}` })),
    ];
    const lines = VerifyReport.text(resultOf({ ok: false, diagnostics })).split("\n");
    expect(lines[1]).toBe(
      "apps/a.ts:21:14 (×4: :30, apps/b.ts, +1) TS2322 Type 'string' is not assignable to type 'number'.",
    );
    expect(lines).toHaveLength(1 + VerifyReport.defaultMax + 1);
    expect(lines.at(-1)).toBe("+6 more · akan verify --max 0");
    expect(VerifyReport.text(resultOf({ ok: false, diagnostics }), { max: 0 }).split("\n")).toHaveLength(27);
  });

  test("caps a line and keeps the whole report within its byte budget", () => {
    const fix = "Move the write into one service method behind one endpoint. ".repeat(10);
    const diagnostics = Array.from({ length: 40 }, (_, idx) =>
      diagnosticOf({ code: `akan.rule.${idx}`, message: "too long ".repeat(20), fix }),
    );
    const text = VerifyReport.text(resultOf({ ok: false, diagnostics }));
    for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(VerifyReport.lineMax);
    expect(new TextEncoder().encode(text).length).toBeLessThan(6_500);
  });
});

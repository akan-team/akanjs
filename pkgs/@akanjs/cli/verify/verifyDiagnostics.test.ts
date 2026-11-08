import { describe, expect, test } from "bun:test";
import { VerifyDiagnostics } from "./verifyDiagnostics";

describe("VerifyDiagnostics", () => {
  test("keeps the head of a TypeScript message chain", () => {
    const [diagnostic] = VerifyDiagnostics.fromTypecheck([
      {
        file: "apps/minimal/main.ts",
        line: 3,
        col: 7,
        code: "TS2322",
        severity: "error",
        message: "Type '{ a: string; }' is not assignable to type 'Memo'.\n  Property 'b' is missing.",
      },
    ]);
    expect(diagnostic?.message).toBe("Type '{ a: string; }' is not assignable to type 'Memo'.");
  });

  test("names the dictionary to edit when an error key is missing, not the cut-off key union", () => {
    const [diagnostic] = VerifyDiagnostics.fromTypecheck([
      {
        file: "apps/minimal/lib/memo/memo.service.ts",
        line: 12,
        col: 19,
        code: "TS2345",
        severity: "error",
        message:
          'Argument of type \'"memo.error.imageTooLargeTypo"\' is not assignable to parameter of type \'"base.error.documentNotFound" | "base.error.gatewayTimeout" | ... 47 more ... | "memo.error.imageRejected"\'.',
      },
    ]);
    expect(diagnostic?.message).toBe('"memo.error.imageTooLargeTypo" is not an error key of the memo dictionary');
    expect(diagnostic?.fix).toContain("add imageTooLargeTypo: [en, ko] to .error({}) in memo.dictionary.ts");
  });

  test("names the dictionary to edit when a translation key is missing", () => {
    const [diagnostic] = VerifyDiagnostics.fromTypecheck([
      {
        file: "apps/minimal/ui/RegistryProbe.tsx",
        line: 52,
        col: 12,
        code: "TS2345",
        severity: "error",
        message:
          'Argument of type \'"memo.titleTypo"\' is not assignable to parameter of type \'ServiceTranslatorKey<"base", BaseEndpoint, "edit" | "error" | ... 116 more ... | "new"> | ... 12 more ... | ServiceTranslatorKey<...>\'.',
      },
    ]);
    expect(diagnostic?.message).toBe('"memo.titleTypo" is not a key of the memo dictionary');
    expect(diagnostic?.fix).toContain("add titleTypo: [en, ko] to .translate({}) in memo.dictionary.ts");
  });

  test("leaves a string-literal mismatch outside the dictionary as TS wrote it", () => {
    const message = 'Argument of type \'"a.b"\' is not assignable to parameter of type \'"c.d" | "e.f"\'.';
    const [diagnostic] = VerifyDiagnostics.fromTypecheck([
      { file: "apps/minimal/main.ts", line: 1, col: 1, code: "TS2345", severity: "error", message },
    ]);
    expect(diagnostic?.message).toBe(message);
    expect(diagnostic?.fix).toBeUndefined();
  });

  test("drops Biome information diagnostics and normalises Windows paths", () => {
    const diagnostics = VerifyDiagnostics.fromBiome({
      diagnostics: [
        {
          severity: "error",
          message: "Don't use console.",
          category: "lint/suspicious/noConsole",
          location: { path: "apps\\minimal\\main.ts", start: { line: 2, column: 3 } },
        },
        { severity: "information", message: "fixed", category: "format" },
      ],
    });
    expect(diagnostics).toEqual([
      {
        step: "lint",
        file: "apps/minimal/main.ts",
        line: 2,
        col: 3,
        code: "lint/suspicious/noConsole",
        severity: "error",
        message: "Don't use console.",
      },
    ]);
  });

  test("lists SSR warnings only for the changed files, never as errors", () => {
    const diagnostics = VerifyDiagnostics.fromQuality(
      [
        { scope: "ssr", rule: "akan.ssr.directive", file: "apps/minimal/ui/A.tsx", line: 1, message: "a" },
        { scope: "ssr", rule: "akan.ssr.directive", file: "apps/minimal/ui/B.tsx", line: 1, message: "b" },
      ] as Parameters<typeof VerifyDiagnostics.fromQuality>[0],
      new Set(["apps/minimal/ui/A.tsx"]),
    );
    expect(diagnostics.map((diagnostic) => [diagnostic.file, diagnostic.severity])).toEqual([
      ["apps/minimal/ui/A.tsx", "warning"],
    ]);
  });

  test("reads a bracketed code and the first workspace location out of a free-form message", () => {
    expect(
      VerifyDiagnostics.fromMessage("build", "[akan.ssr.star-export] apps/minimal/ui/index.ts:4:1 uses export *"),
    ).toEqual({
      step: "build",
      file: "apps/minimal/ui/index.ts",
      line: 4,
      col: 1,
      code: "akan.ssr.star-export",
      severity: "error",
      message: "apps/minimal/ui/index.ts:4:1 uses export *",
    });
    expect(VerifyDiagnostics.fromMessage("sync", "boom")).toMatchObject({ file: null, line: 0, code: "akan.sync" });
  });
});

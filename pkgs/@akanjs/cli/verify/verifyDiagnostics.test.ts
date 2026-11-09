import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BiomeSeverity } from "@akanjs/devkit/linter";
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

  test("points a raw Error in an srvkit adapter at its Err import and the app's own dictionary", () => {
    const rawError = (severity: BiomeSeverity, verb: "throw" | "construct", file: string) => ({
      severity,
      message: `Do not ${verb} a raw \`Error\`: it carries no translatable key or status.`,
      category: "plugin",
      location: { path: file, start: { line: 9, column: 11 } },
    });
    const diagnostics = VerifyDiagnostics.fromBiome({
      diagnostics: [
        rawError("error", "throw", "apps/pokedex/srvkit/pokeApi.ts"),
        rawError("warning", "construct", "libs/shared/srvkit/storage/s3Api.ts"),
        rawError("error", "throw", "apps/pokedex/lib/pokemon/pokemon.service.ts"),
      ],
    });

    expect(diagnostics.map(({ message, fix }) => ({ message, fix }))).toEqual([
      {
        message: "Do not throw a raw `Error`: an srvkit adapter uses `Err` with a key of the pokedex dictionary",
        fix: 'import { Err } from "../lib/dict"; add <key>: [en, ko] to .error({}) in apps/pokedex/lib/_pokedex/pokedex.dictionary.ts; throw new Err("pokedex.error.<key>")',
      },
      {
        message: "Do not construct a raw `Error`: an srvkit adapter uses `Err` with a key of the shared dictionary",
        fix: 'import { Err } from "../../lib/dict"; add <key>: [en, ko] to .error({}) in libs/shared/lib/_shared/shared.dictionary.ts; new Err("shared.error.<key>")',
      },
      { message: "Do not throw a raw `Error`: it carries no translatable key or status.", fix: undefined },
    ]);
  });

  test("names the layer barrel a module file's two-parent import should come from", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akan-deep-import-"));
    try {
      const file = "apps/pokedex/lib/_pokedex/pokedex.service.ts";
      const lines = [
        'import { humanize } from "../../common/humanize";',
        'import { PokeApi } from "../../srvkit/pokeApi"; import { Card } from "../../ui/Card";',
        'import { Storage } from "../../../../libs/shared/srvkit/storage";',
        'import { env } from "../../env/env.server";',
      ];
      await mkdir(path.join(root, path.dirname(file)), { recursive: true });
      await writeFile(path.join(root, file), `${lines.join("\n")}\n`);
      const deepImport = (line: number, column: number) => ({
        severity: "error" as const,
        message: "Module files should not import from two or more parent directories.",
        category: "plugin",
        location: { path: file, start: { line, column } },
      });
      const fixes = VerifyDiagnostics.fromBiome(
        {
          diagnostics: [deepImport(1, 26), deepImport(2, 25), deepImport(2, 70), deepImport(3, 25), deepImport(4, 21)],
        },
        root,
      ).map(({ fix }) => fix);

      expect(fixes).toEqual([
        'import from "@apps/pokedex/common"',
        'import from "@apps/pokedex/srvkit"',
        'import from "@apps/pokedex/ui"',
        'import from "@libs/shared/srvkit"',
        undefined,
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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

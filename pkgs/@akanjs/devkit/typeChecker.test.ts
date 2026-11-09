import { describe, expect, test } from "bun:test";
import path from "node:path";
import * as ts from "typescript";
import { tempDirs, writeJson, writeText } from "./testHelpers";
import { TypeChecker } from "./typeChecker";

const makeTempRoot = tempDirs("akan-devkit-type-checker-");

//? `lib: []` adds global diagnostics (TS2318), and `emitDecoratorMetadata` alone an options one (TS5052).
const project = async (declaration: boolean) => {
  const root = await makeTempRoot();
  const configPath = path.join(root, "tsconfig.json");
  await writeJson(configPath, {
    compilerOptions: {
      strict: true,
      lib: [],
      types: [],
      target: "esnext",
      module: "esnext",
      moduleResolution: "bundler",
      noEmit: true,
      incremental: true,
      tsBuildInfoFile: "./.cache/tsconfig.tsbuildinfo",
      declaration,
      emitDecoratorMetadata: true,
    },
    include: ["src/**/*.ts"],
  });
  await writeText(path.join(root, "src/port.ts"), "export const port: number = 8282;\n");
  await writeText(
    path.join(root, "src/next.ts"),
    'import { port } from "./port";\nexport const next: number = port + 1;\n',
  );
  await writeText(path.join(root, "src/semantic.ts"), 'export const name: number = "akan";\n');
  await writeText(path.join(root, "src/syntax.ts"), "export const broken = (;\n");
  await writeText(path.join(root, "src/declaration.ts"), "export const make = () => class { private secret = 1; };\n");
  return { root, configPath };
};

const describeAll = (root: string, diagnostics: readonly ts.Diagnostic[]) =>
  diagnostics.map((diagnostic) => ({
    file: diagnostic.file ? path.relative(root, diagnostic.file.fileName) : null,
    start: diagnostic.start,
    length: diagnostic.length,
    code: diagnostic.code,
    category: diagnostic.category,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  }));

const preEmitDiagnostics = (root: string, configPath: string) => {
  const { fileNames, options } = TypeChecker.parseConfig(configPath);
  return describeAll(root, ts.getPreEmitDiagnostics(ts.createProgram({ rootNames: fileNames, options })));
};

const nextFileToCheck = (configPath: string) => {
  const { fileNames, options } = TypeChecker.parseConfig(configPath);
  const next = ts
    .createIncrementalProgram({ rootNames: fileNames, options })
    .getSemanticDiagnosticsOfNextAffectedFile();
  return next && ("fileName" in next.affected ? next.affected.fileName : "the whole program");
};

describe("TypeChecker.checkProject", () => {
  test.each([true, false])(
    "reports what getPreEmitDiagnostics does, cold and warm (declaration: %p)",
    async (declaration) => {
      const { root, configPath } = await project(declaration);
      const expected = preEmitDiagnostics(root, configPath);
      expect(new Set(expected.map((diagnostic) => diagnostic.code))).toEqual(
        new Set([5052, 1109, 2318, 2322, ...(declaration ? [4094] : [])]),
      );

      expect(describeAll(root, TypeChecker.checkProject(configPath).diagnostics)).toEqual(expected);
      expect(describeAll(root, TypeChecker.checkProject(configPath).diagnostics)).toEqual(expected);
    },
  );

  test("leaves a cache from which a resumed build has no file left to check", async () => {
    const { configPath } = await project(true);
    TypeChecker.checkProject(configPath);
    expect(nextFileToCheck(configPath)).toBeUndefined();
    TypeChecker.checkProject(configPath);
    expect(nextFileToCheck(configPath)).toBeUndefined();
  });

  test("reports an edit's new errors, and its importer's, and drops a fixed one on a warm run", async () => {
    const { root, configPath } = await project(true);
    TypeChecker.checkProject(configPath);
    await writeText(path.join(root, "src/port.ts"), "export const port: string = 8282;\n");
    await writeText(path.join(root, "src/semantic.ts"), 'export const name: string = "akan";\n');

    const warm = describeAll(root, TypeChecker.checkProject(configPath).diagnostics);
    expect(warm).toEqual(preEmitDiagnostics(root, configPath));
    expect(warm.filter((diagnostic) => diagnostic.code === 2322).map((diagnostic) => diagnostic.file)).toEqual([
      path.join("src", "next.ts"),
      path.join("src", "port.ts"),
    ]);
    expect(nextFileToCheck(configPath)).toBeUndefined();
  });
});

// Emits this package's .d.ts files the way akanjs's pkgs/akanjs/build.ts does for a vendored package:
// the package's tsconfig with declaration + emitDeclarationOnly, every source file except build
// scripts, docs, examples, tests and node_modules. akanjs builds with TypeScript 6 (TypeScript 7 has no
// JavaScript API), so the TypeScript package to use is an argument; errors fail the run, since akanjs
// would otherwise emit types with holes (AKAN_BUILD_DECLARATION_DIAGNOSTICS only warns by default).
//
//   bun scripts/declarations.ts --typescript <folder of a TypeScript 6 package> [--config <tsconfig>] [--out <dir>]

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const tsDir = arg("typescript") ?? process.env.AKAN_TYPESCRIPT;
if (!tsDir) {
  console.error(
    "usage: bun scripts/declarations.ts --typescript <folder of a TypeScript 6 package> [--config <tsconfig>] [--out <dir>]",
  );
  process.exit(2);
}
/** The part of TypeScript 6's compiler API used here (TypeScript 7's type package has none of it). */
interface Diagnostic {
  category: number;
  messageText: unknown;
}
interface FormatHost {
  getCanonicalFileName(file: string): string;
  getCurrentDirectory(): string;
  getNewLine(): string;
}
interface TypeScriptApi {
  version: string;
  sys: { readFile(path: string): string | undefined };
  DiagnosticCategory: { Error: number };
  readConfigFile(path: string, read: (path: string) => string | undefined): { config?: unknown; error?: Diagnostic };
  parseJsonConfigFileContent(
    json: unknown,
    host: unknown,
    basePath: string,
    existing: Record<string, unknown>,
    configFile: string,
  ): { options: unknown; errors: readonly Diagnostic[] };
  createProgram(options: { rootNames: string[]; options: unknown }): { emit(): { diagnostics: readonly Diagnostic[] } };
  getPreEmitDiagnostics(program: unknown): readonly Diagnostic[];
  flattenDiagnosticMessageText(message: unknown, newLine: string): string;
  formatDiagnosticsWithColorAndContext(diagnostics: readonly Diagnostic[], host: FormatHost): string;
}
const entry = join(resolve(tsDir), "lib", "typescript.js");
const ts = existsSync(entry) ? ((await import(entry)).default as TypeScriptApi) : undefined;
if (typeof ts?.createProgram !== "function") {
  console.error(`${tsDir}: no TypeScript compiler API there (TypeScript 7 has none); use a TypeScript 6 package`);
  process.exit(2);
}
const configPath = resolve(arg("config") ?? join(ROOT, "tsconfig.json"));
const out = resolve(arg("out") ?? mkdtempSync(join(tmpdir(), "akan-native-types-")));

// What akanjs leaves out of a vendored package's declarations, plus what this package does not ship.
const EXCLUDED = new Set([
  "build.ts",
  "build",
  "node_modules",
  "docs",
  "scripts",
  "examples",
  "test",
  "package.json",
  "tsconfig.json",
]);
const TEST_FILE = /\.(?:test|spec|fixture|instance)\.[cm]?[tj]sx?$/;

const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  ROOT,
  {
    declaration: true,
    declarationMap: false,
    emitDeclarationOnly: true,
    noEmit: false,
    noEmitOnError: false,
    outDir: out,
    rootDir: ROOT,
    sourceMap: false,
    tsBuildInfoFile: join(out, "tsconfig.tsbuildinfo"),
  },
  configPath,
);
const files: string[] = [];
for await (const file of new Bun.Glob("**/*.{ts,tsx,js,jsx}").scan({ cwd: ROOT, onlyFiles: true })) {
  const parts = file.split("/");
  if (
    EXCLUDED.has(parts[0]!) ||
    parts.includes("test") ||
    parts.includes("node_modules") ||
    parts.includes(".akan") ||
    TEST_FILE.test(file)
  )
    continue;
  files.push(join(ROOT, file));
}
const program = ts.createProgram({ rootNames: files, options: parsed.options });
const emitted = program.emit();
const errors = [...parsed.errors, ...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics].filter(
  (d) => d.category === ts.DiagnosticCategory.Error,
);
const host = { getCanonicalFileName: (f: string) => f, getCurrentDirectory: () => ROOT, getNewLine: () => "\n" };
if (errors.length) console.error(ts.formatDiagnosticsWithColorAndContext(errors, host));
console.info(`TypeScript ${ts.version}: ${files.length} files, ${errors.length} errors → ${out}`);
process.exit(errors.length ? 1 : 0);

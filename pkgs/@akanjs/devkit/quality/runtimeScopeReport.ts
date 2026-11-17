import { readdir } from "node:fs/promises";
import path from "node:path";
import { type RuntimeMarkerPin, RuntimeMarkerReach } from "./runtimeMarkerReach";
import { RuntimeNameTable } from "./runtimeNameTable";
import { RuntimeUse, type RuntimeUseProblem } from "./runtimeUse";
import { WorkspaceSourceFiles } from "./workspaceSourceFiles";

export interface RuntimeScopeNote extends RuntimeUseProblem {
  file: string;
  scope: string;
  constants?: boolean;
}

export interface RuntimeScopeSummary {
  scope: string;
  table: boolean;
  tableMs: number;
  clientFiles: number;
  readers: number;
  resolvable: number;
  wholeScope: number;
  wholeConstants: number;
  analysisMs: number;
  slowestFile: { file: string; ms: number } | null;
  approximations: string[];
}

export interface RuntimeScopeResult {
  scopes: RuntimeScopeSummary[];
  notes: RuntimeScopeNote[];
  markerPins: RuntimeMarkerPin[];
}

const moduleConventionEnds = ["constant", "dictionary", "document", "service", "signal"].map((kind) => `.${kind}.ts`);
const isModuleConventionFile = (file: string) => {
  const lib = file.indexOf("/lib/");
  const end = moduleConventionEnds.find((suffix) => file.endsWith(suffix));
  return lib >= 0 && !!end && lib + "/lib/".length < file.length - end.length;
};
const generatedFile =
  /^(?:apps|libs)\/[^/]+\/(?:\.akan\/.*|client\.ts|server\.ts|lib\/[^/]+\.ts|lib\/__(?:lib|client)\/.*|lib\/.+\/index\.ts|(?:ui|webkit|srvkit|common)\/index\.ts)$/;
const serverOnlyDir = /^(?:apps|libs)\/[^/]+\/(?:srvkit|env|script|native|plugin)\//;
const testFile = /\.(?:test|spec)\.tsx?$|\/__(?:fixtures|tests)__\//;
const useClientDirective = /^\s*(?:\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/;
const constantFile = /^(?:apps|libs)\/[^/]+\/lib\/(?:__lib\/lib|(?:__scalar\/)?([^/_][^/]*)\/\1)\.constant\.ts$/;

export class RuntimeScopeReport {
  static readonly rule = "akan.runtime.whole-scope";
  static readonly constantsRule = "akan.runtime.whole-constants";

  static isConstantFile(file: string) {
    return constantFile.test(file);
  }

  static isRuntimeSource(file: string) {
    if (!/^(?:apps|libs)\/[^/]+\/.+\.tsx?$/.test(file) || file.endsWith(".d.ts")) return false;
    if (testFile.test(file) || generatedFile.test(file) || isModuleConventionFile(file)) return false;
    return !serverOnlyDir.test(file) && !/^(?:apps|libs)\/[^/]+\/(?:akan\.config|main)\.ts$/.test(file);
  }

  static isClientFile(file: string, text: string) {
    if (!RuntimeScopeReport.isRuntimeSource(file)) return false;
    if (/^(?:apps|libs)\/[^/]+\/page\//.test(file)) return useClientDirective.test(text);
    return true;
  }

  static async scan(workspaceRoot: string): Promise<RuntimeScopeResult> {
    const scopes = await RuntimeScopeReport.#scopesOf(workspaceRoot);
    const tables = new Map<string, RuntimeNameTable | null>();
    const tableMs = new Map<string, number>();
    for (const scope of scopes) {
      const started = performance.now();
      tables.set(scope, await RuntimeNameTable.read(workspaceRoot, scope));
      tableMs.set(scope, performance.now() - started);
    }
    const sources = new WorkspaceSourceFiles(workspaceRoot);
    const summaries = new Map(
      scopes.map((scope) => [scope, RuntimeScopeReport.#emptySummary(scope, tables.get(scope), tableMs.get(scope))]),
    );
    const notes: RuntimeScopeNote[] = [];
    const files = await sources.collect();
    for (const file of files) {
      const scope = file.match(/^((?:apps|libs)\/[^/]+)\//)?.[1];
      const summary = scope && summaries.get(scope);
      if (!scope || !summary || !/\.tsx?$/.test(file)) continue;
      const { content, sourceFile } = await sources.read(file);
      const constantFile = RuntimeScopeReport.isConstantFile(file);
      if (!constantFile && !RuntimeScopeReport.isClientFile(file, content)) continue;
      if (!constantFile) summary.clientFiles++;
      const table = tables.get(scope);
      if (!table) continue;
      const started = performance.now();
      const verdict = RuntimeUse.analyze({ fileName: file, text: content, sourceFile }, table);
      const ms = performance.now() - started;
      summary.analysisMs += ms;
      if (!summary.slowestFile || ms > summary.slowestFile.ms) summary.slowestFile = { file, ms };
      const [constantProblem] = verdict.constants.problems;
      if (constantProblem) {
        summary.wholeConstants++;
        notes.push(RuntimeScopeReport.noteOf(file, scope, constantProblem, true));
      }
      if (constantFile || (verdict.resolvable && !verdict.reads)) continue;
      summary.readers++;
      if (verdict.resolvable) summary.resolvable++;
      else {
        summary.wholeScope++;
        notes.push(RuntimeScopeReport.noteOf(file, scope, verdict));
      }
    }
    const markerPins = new RuntimeMarkerReach(workspaceRoot).pinsOf(files);
    return { scopes: [...summaries.values()], notes, markerPins };
  }

  static noteOf(
    file: string,
    scope: string,
    { reason, line, column, text, message }: RuntimeUseProblem,
    constants = false,
  ): RuntimeScopeNote {
    return { file, scope, reason, line, column, text, message, ...(constants ? { constants } : {}) };
  }

  static format({ scopes, notes, markerPins }: RuntimeScopeResult) {
    const fileLines = notes.map(({ file, line, column, message, scope, constants }) =>
      constants
        ? `${file}:${line}:${column} - note ${RuntimeScopeReport.constantsRule}: ${message}. The file works; a page that loads it loads the constants of every model ${scope} reaches.`
        : `${file}:${line}:${column} - note ${RuntimeScopeReport.rule}: ${message}. The file works; a page that loads it loads ${scope}'s whole client runtime.`,
    );
    const scopeLines = scopes.map((summary) => {
      const timing = `table ${summary.tableMs.toFixed(0)}ms, analysis ${summary.analysisMs.toFixed(0)}ms`;
      if (!summary.table) return `${summary.scope}: no generated client runtime to read (run akan sync); ${timing}`;
      const slowest = summary.slowestFile ? `, slowest file ${summary.slowestFile.ms.toFixed(1)}ms` : "";
      const approximated = summary.approximations.length
        ? `, ${summary.approximations.length} module declarations read approximately`
        : "";
      const constants = summary.wholeConstants ? `, ${summary.wholeConstants} keep every constant` : "";
      return `${summary.scope}: ${summary.readers} of ${summary.clientFiles} client files read the runtime, ${summary.resolvable} per module, ${summary.wholeScope} whole${constants} (${timing}${slowest}${approximated})`;
    });
    const noteLines = [...fileLines, ...RuntimeMarkerReach.format(markerPins)];
    return [...noteLines, ...(noteLines.length ? [""] : []), ...scopeLines].join("\n");
  }

  static #emptySummary(scope: string, table: RuntimeNameTable | null | undefined, ms = 0): RuntimeScopeSummary {
    return {
      scope,
      table: !!table,
      tableMs: ms,
      clientFiles: 0,
      readers: 0,
      resolvable: 0,
      wholeScope: 0,
      wholeConstants: 0,
      analysisMs: 0,
      slowestFile: null,
      approximations: table?.approximations ?? [],
    };
  }

  static async #scopesOf(workspaceRoot: string) {
    const scopes: string[] = [];
    for (const dir of ["apps", "libs"]) {
      const entries = await readdir(path.join(workspaceRoot, dir), { withFileTypes: true }).catch(() => []);
      for (const entry of entries) if (entry.isDirectory()) scopes.push(`${dir}/${entry.name}`);
    }
    return scopes.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
}

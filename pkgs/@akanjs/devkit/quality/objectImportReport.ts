import path from "node:path";
import { AppExecutor } from "../executors/appExecutor";
import type { WorkspaceExecutor } from "../executors/workspaceExecutor";
import { BarrelAnalyzer } from "../transforms/barrelAnalyzer";
import { createTsconfigPackageResolver, rewriteBarrelImports } from "../transforms/barrelImportsPlugin";
import { type ObjectKeepReason, ObjectMemberImports } from "../transforms/objectMemberImports";
import { RuntimeScopeReport } from "./runtimeScopeReport";
import { WorkspaceSourceFiles } from "./workspaceSourceFiles";

export interface ObjectImportScope {
  scope: string;
  app: string;
  narrowed: number;
  kept: number;
  reasons: Partial<Record<ObjectKeepReason, number>>;
}

export interface ObjectImportKeptEntry {
  file: string;
  line: number;
  object: string;
  objectFile: string;
  reason: ObjectKeepReason;
}

export interface ObjectImportResult {
  scopes: ObjectImportScope[];
  kept: ObjectImportKeptEntry[];
}

interface ScopeReader {
  barrels: string[];
  analyzer: BarrelAnalyzer;
  objects: ObjectMemberImports;
}

const MACRO_ATTR_RE = /with\s*\{\s*type\s*:\s*["']macro["']\s*\}/;

//* What a build does with each object import (`Memo.Zone.View`, `Field.Text`) in apps and libs: narrowed to the
//* members it names, or kept whole and why. A lib is read as the first app reads it.
export class ObjectImportReport {
  static async scan(workspace: WorkspaceExecutor): Promise<ObjectImportResult> {
    const apps = (await workspace.getApps()).sort();
    const result: ObjectImportResult = { scopes: [], kept: [] };
    const [firstApp] = apps;
    if (firstApp === undefined) return result;
    const readers = new Map<string, ScopeReader>();
    const readerOf = async (app: string) => {
      const cached = readers.get(app);
      if (cached) return cached;
      const executor = AppExecutor.from(workspace, app);
      const resolvePackage = await createTsconfigPackageResolver(executor);
      const barrels = (await executor.getConfig()).barrelImports;
      const analyzer = new BarrelAnalyzer({ resolvePackage, packageRoot: workspace.workspaceRoot });
      const resolve = ObjectMemberImports.resolverOf(resolvePackage);
      const reader: ScopeReader = {
        barrels,
        analyzer,
        objects: new ObjectMemberImports({ resolve, barrels: { names: barrels, analyzer } }),
      };
      readers.set(app, reader);
      return reader;
    };
    const sources = new WorkspaceSourceFiles(workspace.workspaceRoot);
    const scopes = new Map<string, ObjectImportScope>();
    for (const file of await sources.collect()) {
      const [, kind, name] = file.match(/^(apps|libs)\/([^/]+)\//) ?? [];
      if (!kind || !name || !RuntimeScopeReport.isRuntimeSource(file)) continue;
      const app = kind === "apps" ? name : firstApp;
      if (!apps.includes(app)) continue;
      const { content, absolutePath } = await sources.read(file);
      if (MACRO_ATTR_RE.test(content)) continue;
      const reader = await readerOf(app);
      const rewritten = await rewriteBarrelImports(content, reader.barrels, reader.analyzer, {
        keepLines: true,
        reexports: true,
      });
      const rewrite = await reader.objects.rewrite(rewritten ?? content, absolutePath);
      if (!rewrite || rewrite.narrowed.length + rewrite.kept.length === 0) continue;
      const scope = `${kind}/${name}`;
      const summary = scopes.get(scope) ?? { scope, app, narrowed: 0, kept: 0, reasons: {} };
      scopes.set(scope, summary);
      summary.narrowed += rewrite.narrowed.length;
      for (const kept of rewrite.kept) {
        summary.kept++;
        summary.reasons[kept.reason] = (summary.reasons[kept.reason] ?? 0) + 1;
        const objectFile = path.relative(workspace.workspaceRoot, kept.file).split(path.sep).join("/");
        result.kept.push({ file, line: kept.line, object: kept.object, objectFile, reason: kept.reason });
      }
    }
    result.scopes = [...scopes.values()];
    return result;
  }

  static format({ scopes, kept }: ObjectImportResult) {
    const lines = scopes.map(({ scope, narrowed, kept: whole, reasons }) => {
      const counts = Object.entries(reasons)
        .sort(([a, x = 0], [b, y = 0]) => y - x || (a < b ? -1 : 1))
        .map(([reason, count]) => `${reason} ${count}`);
      return `${scope}: ${narrowed} object imports load only the members they name, ${whole} load the whole object${counts.length ? ` (${counts.join(", ")})` : ""}`;
    });
    if (kept.length) lines.push("--format json lists each import that loads the whole object, with its file and line");
    return lines.join("\n");
  }
}

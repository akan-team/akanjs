import path from "node:path";
import type { BunPlugin } from "bun";
import ts from "typescript";
import type { App } from "../commandDecorators";
import { BarrelAnalyzer, type BarrelExportMap, type PackageEntry } from "./barrelAnalyzer";
import { loaderFor, type NamedItem, parseNamedList } from "./moduleSyntax";

export interface BarrelImportsPluginOptions {
  /** Absolute paths whose content is returned unchanged (e.g. node_modules). */
  skipPath?: (absPath: string) => boolean;
  /** Runs after the rewrite in the same onLoad (Bun's onLoad cannot fall through); null means no change. */
  pipeAfter?: (source: string, args: { path: string }) => string | Promise<string | null> | null;
}

export const createBarrelImportsPlugin = async (
  app: App,
  { skipPath = defaultSkipPath, pipeAfter }: BarrelImportsPluginOptions = {},
): Promise<BunPlugin> => {
  const akanConfig = await app.getConfig();
  const barrels = [...new Set(akanConfig.barrelImports)].filter(Boolean);
  const analyzer = new BarrelAnalyzer({
    resolvePackage: await createTsconfigPackageResolver(app),
  });

  return {
    name: "barrel-imports",
    setup(build) {
      // node_modules/akanjs stays in: framework `"use client"` modules still need RSC stubbing in generated workspaces.
      // The optional `?v=N` tail matches HMR cache-busted paths; it is stripped before reading.
      build.onLoad(
        {
          filter:
            /^(?:(?!.*[\\/]node_modules[\\/]).*|.*[\\/]node_modules[\\/]akanjs[\\/].*)\.(tsx|ts|jsx|js)(\?v=\d+)?$/,
        },
        async (args) => {
          const realPath = args.path.replace(/\?v=\d+$/, "");
          const loader = loaderFor(realPath);
          let source = await Bun.file(realPath).text();
          if (skipPath(realPath)) return { contents: source, loader };

          // Bun's macro evaluator races when a rewritten module holds `with { type: "macro" }` imports while another
          // macro host evaluates (a macro identifier ends up undefined), so macro hosts keep their barrel imports.
          if (!MACRO_ATTR_RE.test(source) && barrels.length > 0) {
            const rewritten = await rewriteBarrelImports(source, barrels, analyzer);
            if (rewritten !== null) source = rewritten;
          }

          if (pipeAfter) {
            const piped = await pipeAfter(source, { path: realPath });
            if (piped !== null) source = piped;
          }

          return { contents: source, loader };
        },
      );
    },
  };
};

/** Resolves a package specifier to its barrel entry via tsconfig `paths`, falling back to node_modules. */
export const createTsconfigPackageResolver = async (
  app: App,
): Promise<(pkgName: string) => Promise<PackageEntry | null>> => {
  const tsconfig = await app.getTsConfig();
  const tsconfigPaths = tsconfig.compilerOptions.paths ?? {};
  // Longest prefix first so `@libs/util/*` wins over `@libs/*`.
  const wildcardEntries = Object.entries(tsconfigPaths)
    .filter(([k]) => k.endsWith("/*"))
    .map(([k, v]) => ({ prefix: k.slice(0, -1), replacements: v }))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  return async (pkgName) => {
    const exact = tsconfigPaths[pkgName];
    if (exact && exact.length > 0) {
      const raw = exact[0];
      if (!raw) return null;
      const entryFile = path.resolve(app.workspace.workspaceRoot, raw);
      if (!(await Bun.file(entryFile).exists())) return null;
      // A facet barrel (`@libs/util/server` -> `libs/util/server.ts`) takes subpaths from its parent package, so a leaf
      // rewrites to `@libs/util/lib/sig` (resolvable via `@libs/*`), not the missing `@libs/util/server/lib/sig`.
      const parsed = path.parse(entryFile);
      const lastSlash = pkgName.lastIndexOf("/");
      if (parsed.name !== "index" && lastSlash > 0 && pkgName.slice(lastSlash + 1) === parsed.name)
        return { pkgName: pkgName.slice(0, lastSlash), entryFile, pkgDir: parsed.dir };
      return { pkgName, entryFile, pkgDir: path.dirname(entryFile) };
    }

    // Without the wildcard fallback `@libs/util/ui`-style barrels never resolve and load whole, macro graph included.
    for (const { prefix, replacements } of wildcardEntries) {
      if (!pkgName.startsWith(prefix)) continue;
      const suffix = pkgName.slice(prefix.length);
      for (const repl of replacements) {
        if (!repl) continue;
        const replPath = repl.endsWith("/*") ? repl.slice(0, -1) : repl;
        const candidate = path.resolve(app.workspace.workspaceRoot, replPath + suffix);
        // A sibling file (`apps/minimal/client.ts`) is a facet barrel too: parent specifier, as above.
        for (const ext of CANDIDATE_EXTS) {
          const file = `${candidate}${ext}`;
          if (await Bun.file(file).exists()) {
            const lastSlash = pkgName.lastIndexOf("/");
            const parentSpec = lastSlash > 0 ? pkgName.slice(0, lastSlash) : pkgName;
            return { pkgName: parentSpec, entryFile: file, pkgDir: path.dirname(file) };
          }
        }
        for (const ext of CANDIDATE_EXTS) {
          const file = path.join(candidate, `index${ext}`);
          if (await Bun.file(file).exists()) return { pkgName, entryFile: file, pkgDir: candidate };
        }
      }
      // A matched prefix with nothing on disk stops here, so a shorter prefix cannot resolve somewhere unrelated.
      return null;
    }

    // `akanjs/ui` resolves through node_modules/akanjs/package.json exports, not node_modules/akanjs/ui.
    const exported = await resolveNodePackageExport(app.workspace.workspaceRoot, pkgName);
    if (exported) return exported;

    const pkgJsonPath = path.join(app.workspace.workspaceRoot, "node_modules", pkgName, "package.json");
    if (!(await Bun.file(pkgJsonPath).exists())) return null;
    try {
      const pkgJson = JSON.parse(await Bun.file(pkgJsonPath).text()) as {
        main?: string;
        module?: string;
      };
      const rel = pkgJson.module ?? pkgJson.main ?? "index.js";
      const entryFile = path.resolve(path.dirname(pkgJsonPath), rel);
      if (!(await Bun.file(entryFile).exists())) return null;
      return { pkgName, entryFile, pkgDir: path.dirname(pkgJsonPath) };
    } catch {
      return null;
    }
  };
};

const CANDIDATE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const NODE_MODULES_RE = /[\\/]node_modules[\\/]/;
const AKANJS_NODE_MODULE_RE = /[\\/]node_modules[\\/]akanjs[\\/]/;
const defaultSkipPath = (absPath: string) => NODE_MODULES_RE.test(absPath) && !AKANJS_NODE_MODULE_RE.test(absPath);

type ExportValue = string | string[] | { [condition: string]: ExportValue | undefined };

const resolveNodePackageExport = async (workspaceRoot: string, specifier: string): Promise<PackageEntry | null> => {
  const packageName = getPackageName(specifier);
  if (!packageName) return null;
  const pkgJsonPath = path.join(workspaceRoot, "node_modules", packageName, "package.json");
  if (!(await Bun.file(pkgJsonPath).exists())) return null;

  try {
    const pkgDir = path.dirname(pkgJsonPath);
    const pkgJson = JSON.parse(await Bun.file(pkgJsonPath).text()) as {
      exports?: Record<string, ExportValue>;
      module?: string;
      main?: string;
    };
    const subpath = specifier === packageName ? "." : `.${specifier.slice(packageName.length)}`;
    const exported = resolvePackageExport(pkgJson.exports, subpath);
    const rel = exported ?? (subpath === "." ? (pkgJson.module ?? pkgJson.main ?? "index.js") : null);
    if (!rel?.startsWith(".")) return null;
    const entryFile = await resolveFileCandidate(path.resolve(pkgDir, rel));
    if (!entryFile) return null;
    return { pkgName: specifier, entryFile, pkgDir: path.dirname(entryFile), preserveFilePath: true };
  } catch {
    return null;
  }
};

const resolveExportValue = (value: ExportValue | undefined): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = resolveExportValue(item);
      if (resolved) return resolved;
    }
    return null;
  }
  for (const condition of ["source", "import", "default", "types"]) {
    const resolved = resolveExportValue(value[condition]);
    if (resolved) return resolved;
  }
  return null;
};

const resolvePackageExport = (exportsMap: Record<string, ExportValue> | undefined, subpath: string): string | null => {
  if (!exportsMap) return null;
  const exact = resolveExportValue(exportsMap[subpath]);
  if (exact) return exact;

  for (const [key, value] of Object.entries(exportsMap)) {
    const starIdx = key.indexOf("*");
    if (starIdx === -1) continue;
    const prefix = key.slice(0, starIdx);
    const suffix = key.slice(starIdx + 1);
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const wildcard = subpath.slice(prefix.length, subpath.length - suffix.length);
    const resolved = resolveExportValue(value);
    if (resolved) return resolved.split("*").join(wildcard);
  }

  return null;
};

const getPackageName = (specifier: string): string | null => {
  const parts = specifier.split("/");
  if (!parts[0]) return null;
  if (specifier.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  return parts[0];
};

const resolveFileCandidate = async (candidate: string): Promise<string | null> => {
  if (await Bun.file(candidate).exists()) return candidate;
  if (path.extname(candidate)) return null;
  for (const ext of CANDIDATE_EXTS) {
    const file = `${candidate}${ext}`;
    if (await Bun.file(file).exists()) return file;
  }
  for (const ext of CANDIDATE_EXTS) {
    const file = path.join(candidate, `index${ext}`);
    if (await Bun.file(file).exists()) return file;
  }
  return null;
};

const MACRO_ATTR_RE = /with\s*\{\s*type\s*:\s*["']macro["']\s*\}/;

export const rewriteBarrelImports = async (
  source: string,
  barrels: string[],
  analyzer: BarrelAnalyzer,
): Promise<string | null> => {
  // Sound pre-filter before the costly parse: a static import cannot name a specifier absent from the text.
  if (!barrels.some((barrel) => source.includes(barrel))) return null;
  const statements = findImportStatements(source);
  if (statements.length === 0) return null;

  // Walk import statements in reverse so replacements don't shift earlier ranges.
  let changed = false;
  let out = source;
  for (let i = statements.length - 1; i >= 0; i--) {
    const stmt = statements[i];
    if (!stmt) continue;
    if (!barrels.includes(stmt.specifier)) continue;
    const map = await analyzer.analyze(stmt.specifier);
    if (!map || map.size === 0) continue;
    const replacement = rewriteSingleStatement(stmt, map);
    if (replacement === null) continue;
    out = out.slice(0, stmt.start) + replacement + out.slice(stmt.end);
    changed = true;
  }
  return changed ? out : null;
};

interface ImportStatement {
  start: number;
  end: number;
  clause: string;
  specifier: string;
}

const findImportStatements = (source: string): ImportStatement[] => {
  const statements: ImportStatement[] = [];
  // `setParentNodes: false` holds only while nothing reads `node.parent` and positions use `getStart(sourceFile)`.
  const sourceFile = ts.createSourceFile(
    "barrel-imports.tsx",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const importClause = statement.importClause;
    if (!importClause) continue;
    statements.push({
      start: statement.getStart(sourceFile),
      end: statement.end,
      clause: source.slice(importClause.getStart(sourceFile), importClause.end).trim(),
      specifier: statement.moduleSpecifier.text,
    });
  }
  return statements;
};

interface ParsedClause {
  defaultImport?: string;
  namespaceImport?: string;
  named?: NamedItem[];
  typeOnly: boolean;
}

const parseImportClause = (clause: string): ParsedClause | null => {
  let rest = clause.trim();
  let typeOnly = false;
  if (rest.startsWith("type ")) {
    typeOnly = true;
    rest = rest.slice(5).trim();
  }
  const parsed: ParsedClause = { typeOnly };
  const commaMatch = /^(\w+)\s*,\s*(.+)$/.exec(rest);
  if (commaMatch) {
    parsed.defaultImport = commaMatch[1];
    rest = commaMatch[2] ?? "";
  } else if (/^\w+$/.test(rest)) {
    parsed.defaultImport = rest;
    return parsed;
  }
  if (rest.startsWith("*")) {
    const ns = /^\*\s+as\s+(\w+)$/.exec(rest);
    if (!ns) return null;
    parsed.namespaceImport = ns[1];
    return parsed;
  }
  if (rest.startsWith("{")) {
    const close = rest.indexOf("}");
    if (close === -1) return null;
    parsed.named = parseNamedList(rest.slice(1, close));
  }
  return parsed;
};

const rewriteSingleStatement = (stmt: ImportStatement, map: BarrelExportMap): string | null => {
  const clause = parseImportClause(stmt.clause);
  if (!clause) return null;
  // Namespace imports need the whole barrel — cannot rewrite safely.
  if (clause.namespaceImport) return null;
  // Pure type imports are erased at build; leave them alone.
  if (clause.typeOnly && !clause.defaultImport) return null;
  if (!clause.named?.length) return null;

  const remaining: NamedItem[] = [];
  const rewrites = new Map<string, NamedItem[]>();
  for (const item of clause.named) {
    if (item.isType) {
      remaining.push(item);
      continue;
    }
    const target = map.get(item.imported);
    if (!target) {
      remaining.push(item);
      continue;
    }
    const list = rewrites.get(target.subpath) ?? [];
    list.push({ imported: target.originalName, local: item.local, isType: false });
    rewrites.set(target.subpath, list);
  }

  if (rewrites.size === 0) return null;

  const lines: string[] = [];
  if (shouldPreserveBarrelSideEffects(stmt.specifier)) lines.push(`import "${stmt.specifier}";`);

  if (clause.defaultImport || remaining.length > 0) {
    const parts: string[] = [];
    if (clause.defaultImport) parts.push(clause.defaultImport);
    if (remaining.length > 0) parts.push(`{ ${remaining.map(serializeNamedItem).join(", ")} }`);
    lines.push(`import ${parts.join(", ")} from "${stmt.specifier}";`);
  }

  for (const [subpath, items] of rewrites) {
    lines.push(`import { ${items.map(serializeNamedItem).join(", ")} } from "${subpath}";`);
  }

  return lines.join("\n");
};

const shouldPreserveBarrelSideEffects = (specifier: string): boolean => /^@(apps|libs)\/[^/]+\/client$/.test(specifier);

const serializeNamedItem = (item: NamedItem): string => {
  const prefix = item.isType ? "type " : "";
  if (item.imported === item.local) return `${prefix}${item.imported}`;
  return `${prefix}${item.imported} as ${item.local}`;
};

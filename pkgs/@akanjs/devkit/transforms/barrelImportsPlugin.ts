import path from "node:path";
import type { BunPlugin } from "bun";
import ts from "typescript";
import type { App } from "../commandDecorators";
import { BarrelAnalyzer, type BarrelExportMap, type PackageEntry } from "./barrelAnalyzer";

export interface BarrelImportsPluginOptions {
  /** Absolute paths whose content should be returned unchanged (e.g. node_modules). */
  skipPath?: (absPath: string) => boolean;
  /**
   * Optional transform applied after the barrel rewrite in the same onLoad
   * pass. Useful to chain further transforms (e.g. `"use client"` stubbing)
   * that would otherwise be blocked — Bun's `onLoad` cannot fall through to a
   * second plugin once a response is returned.
   * Return the transformed source, or `null` to indicate no change.
   */
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
      // Exclude third-party node_modules, but keep node_modules/akanjs in generated
      // workspaces so framework `"use client"` modules are still stubbed for RSC.
      //
      // The optional `(\?v=\d+)?` tail lets the filter match paths that HMR
      // has version-tagged (`./_index.tsx?v=3`). We strip the query before
      // reading and normalize it away from the path we pass downstream so
      // only the cache-bust `pipeAfter` step (if any) knows about it.
      build.onLoad(
        {
          filter:
            /^(?:(?!.*[\\/]node_modules[\\/]).*|.*[\\/]node_modules[\\/]akanjs[\\/].*)\.(tsx|ts|jsx|js)(\?v=\d+)?$/,
        },
        async (args) => {
          const realPath = args.path.replace(/\?v=\d+$/, "");
          const loader = loaderFor(realPath);
          if (skipPath(realPath)) {
            const raw = await Bun.file(realPath).text();
            return { contents: raw, loader };
          }

          let source = await Bun.file(realPath).text();

          // Bun's macro evaluator has a race condition when the plugin returns
          // rewritten source for a module that also contains
          // `with { type: "macro" }` imports *and* another macro-host file is
          // being evaluated concurrently in the same graph: one of the macro
          // identifiers ends up undefined at runtime (e.g. `getSerializedSignal
          // is not defined`). Returning the unmodified source for macro hosts
          // sidesteps the race. The trade-off is that a handful of `useClient`-
          // style files keep their original barrel imports; the rest of the
          // tree still benefits from flattening.
          const hasMacroAttr = MACRO_ATTR_RE.test(source);

          if (!hasMacroAttr && barrels.length > 0) {
            // The pre-check that used to live here — "does this file mention a barrel at all" — now
            // lives inside `rewriteBarrelImports`, so every caller gets it rather than just this one.
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

/**
 * Build a `resolvePackage` that maps a package specifier (like `akanjs/ui`)
 * to its barrel entry file using the workspace tsconfig `paths`. If no direct
 * mapping exists, falls back to node_modules resolution.
 */
export const createTsconfigPackageResolver = async (
  app: App,
): Promise<(pkgName: string) => Promise<PackageEntry | null>> => {
  const tsconfig = await app.getTsConfig();
  const tsconfigPaths = tsconfig.compilerOptions.paths ?? {};
  // Pre-compute wildcard entries so we don't walk the full map per lookup.
  // Longer prefixes sort first so `@libs/util/*` wins over `@libs/*`.
  const wildcardEntries = Object.entries(tsconfigPaths)
    .filter(([k]) => k.endsWith("/*"))
    .map(([k, v]) => ({
      prefix: k.slice(0, -1), // keep trailing `/`
      replacements: v,
    }))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  return async (pkgName) => {
    const exact = tsconfigPaths[pkgName];
    if (exact && exact.length > 0) {
      const raw = exact[0];
      if (!raw) return null;
      const entryFile = path.resolve(app.workspace.workspaceRoot, raw);
      if (!(await Bun.file(entryFile).exists())) return null;
      // Detect "facet" barrels: specifiers like `@libs/util/server` whose entry
      // file is a sibling inside the parent directory (`libs/util/server.ts`)
      // rather than an `index.*` inside a dedicated package directory
      // (`libs/util/server/index.ts`). For facets, the subpath the analyzer
      // generates for a leaf like `libs/util/lib/sig.ts` must be computed
      // against the parent package (`@libs/util`) so that the rewritten
      // import resolves via the workspace's `@libs/*` tsconfig wildcard
      // (`libs/util/lib/sig`). Using the raw `pkgName` (`@libs/util/server`)
      // would generate `@libs/util/server/lib/sig`, a path that does not exist
      // on disk and cannot be imported.
      const parsed = path.parse(entryFile);
      const lastSlash = pkgName.lastIndexOf("/");
      if (parsed.name !== "index" && lastSlash !== -1) {
        const facet = pkgName.slice(lastSlash + 1);
        const parentSpec = pkgName.slice(0, lastSlash);
        if (facet === parsed.name && parentSpec.length > 0) {
          return { pkgName: parentSpec, entryFile, pkgDir: parsed.dir };
        }
      }
      return { pkgName, entryFile, pkgDir: path.dirname(entryFile) };
    }

    // Wildcard fallback: tsconfig entries like `@libs/*` → `./libs/*` map a
    // whole family of specifiers to workspace directories. Without this,
    // barrels such as `@libs/util/ui` or `@apps/minimal/client` never resolve
    // to an entry file — the analyzer returns `null`, the plugin skips them,
    // and the consumer falls back to Bun's default resolution which loads the
    // full barrel (pulling the entire transitive macro / side-effect graph).
    for (const { prefix, replacements } of wildcardEntries) {
      if (!pkgName.startsWith(prefix)) continue;
      const suffix = pkgName.slice(prefix.length);
      for (const repl of replacements) {
        if (!repl) continue;
        const replPath = repl.endsWith("/*") ? repl.slice(0, -1) : repl;
        const candidate = path.resolve(app.workspace.workspaceRoot, replPath + suffix);
        // Try `candidate.<ext>` first (facet-barrel: sibling file like
        // `apps/minimal/client.ts`). If it exists we treat the PARENT directory
        // as `pkgDir` and the PARENT specifier (`@apps/minimal`) as `pkgName`
        // so a leaf at `apps/minimal/lib/useClient.ts` rewrites to
        // `@apps/minimal/lib/useClient` and resolves via the same `@apps/*`
        // wildcard. Using the raw `pkgName` would yield
        // `@apps/minimal/client/lib/useClient`, a path that does not exist.
        for (const ext of CANDIDATE_EXTS) {
          const file = `${candidate}${ext}`;
          if (await Bun.file(file).exists()) {
            const lastSlash = pkgName.lastIndexOf("/");
            if (lastSlash !== -1) {
              const parentSpec = pkgName.slice(0, lastSlash);
              if (parentSpec.length > 0) {
                return { pkgName: parentSpec, entryFile: file, pkgDir: path.dirname(file) };
              }
            }
            return { pkgName, entryFile: file, pkgDir: path.dirname(file) };
          }
        }
        for (const ext of CANDIDATE_EXTS) {
          const file = path.join(candidate, `index${ext}`);
          if (await Bun.file(file).exists()) {
            return { pkgName, entryFile: file, pkgDir: candidate };
          }
        }
      }
      // A prefix matched but nothing on disk — stop so a shorter, less specific
      // prefix doesn't accidentally resolve to an unrelated location.
      return null;
    }

    // Fallback: resolve package exports from node_modules. This supports
    // single-package subpaths such as `akanjs/ui`, whose package.json lives at
    // node_modules/akanjs/package.json rather than node_modules/akanjs/ui.
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
    if (!rel || !rel.startsWith(".")) return null;
    const entryFile = await resolveFileCandidate(path.resolve(pkgDir, rel));
    if (!entryFile) return null;
    const pkgEntryName = specifier;
    return { pkgName: pkgEntryName, entryFile, pkgDir: path.dirname(entryFile), preserveFilePath: true };
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
    if (resolved) return resolved.replace("*", wildcard);
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

// Matches `with { type: "macro" }` import attributes (single or double quotes,
// tolerant of whitespace). Used to detect macro-host modules so the plugin
// can leave their source untouched.
const MACRO_ATTR_RE = /with\s*\{\s*type\s*:\s*["']macro["']\s*\}/;

/** Exposed for testing. */
export const rewriteBarrelImports = async (
  source: string,
  barrels: string[],
  analyzer: BarrelAnalyzer,
): Promise<string | null> => {
  // Establish there is something to rewrite before the TypeScript parser is involved. This runs on
  // every source file of every dev rebuild, and parsing was by far the most expensive thing in one:
  // measured across 1189 files here, 299ms and 161MB of RSS, of which **63% of files import no barrel
  // at all**. A static import cannot name a specifier without that specifier appearing literally in the
  // text, so a substring test is a sound filter and costs 4ms for the whole corpus.
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
  trailingSemicolon: boolean;
  raw: string;
}

const findImportStatements = (source: string): ImportStatement[] => {
  const statements: ImportStatement[] = [];
  // `setParentNodes: false`: nothing below reads `node.parent`, and every position comes from
  // `getStart(sourceFile)`, which takes the file explicitly. Building the parent links cost 132ms and
  // 143MB of RSS across 1189 files for no reader.
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
    const statementStart = statement.getStart(sourceFile);
    const statementEnd = statement.end;
    statements.push({
      start: statementStart,
      end: statementEnd,
      clause: source.slice(importClause.getStart(sourceFile), importClause.end).trim(),
      specifier: statement.moduleSpecifier.text,
      trailingSemicolon: source.slice(statement.moduleSpecifier.end, statement.end).includes(";"),
      raw: source.slice(statementStart, statementEnd),
    });
  }
  return statements;
};

interface NamedImportItem {
  imported: string;
  local: string;
  isType: boolean;
}

interface ParsedClause {
  defaultImport?: string;
  namespaceImport?: string;
  named?: NamedImportItem[];
  /** Whole clause is `import type { ... } from "..."`. */
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
  // Try pattern: default + rest
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
    const inner = rest.slice(1, close);
    parsed.named = parseNamedImportList(inner);
    return parsed;
  }
  return parsed;
};

const parseNamedImportList = (body: string): NamedImportItem[] => {
  const out: NamedImportItem[] = [];
  for (const raw of body.split(",")) {
    const s = raw.trim();
    if (!s) continue;
    let isType = false;
    let rest = s;
    if (rest.startsWith("type ")) {
      isType = true;
      rest = rest.slice(5).trim();
    }
    const asMatch = /^(\w+)\s+as\s+(\w+)$/.exec(rest);
    if (asMatch) {
      out.push({ imported: asMatch[1] ?? "", local: asMatch[2] ?? "", isType });
      continue;
    }
    if (/^\w+$/.test(rest)) {
      out.push({ imported: rest, local: rest, isType });
    }
  }
  return out;
};

const rewriteSingleStatement = (stmt: ImportStatement, map: BarrelExportMap): string | null => {
  const clause = parseImportClause(stmt.clause);
  if (!clause) return null;
  // Namespace imports need the whole barrel — cannot rewrite safely.
  if (clause.namespaceImport) return null;
  // Pure type imports are erased at build; leave them alone.
  if (clause.typeOnly && !clause.defaultImport) return null;
  if (!clause.named || clause.named.length === 0) {
    // Only default import — nothing to split.
    return null;
  }

  const remaining: NamedImportItem[] = [];
  const rewrites = new Map<string, NamedImportItem[]>();
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
    // Use the leaf's original name, keeping the consumer's local alias.
    list.push({ imported: target.originalName, local: item.local, isType: false });
    rewrites.set(target.subpath, list);
  }

  if (rewrites.size === 0) return null;

  const lines: string[] = [];
  // Always emit trailing semicolons; safe even when the source omitted them.
  const tail = ";";

  if (shouldPreserveBarrelSideEffects(stmt.specifier)) {
    lines.push(`import "${stmt.specifier}"${tail}`);
  }

  // Re-emit an import from the original barrel that carries whatever we could
  // not flatten (default import, type-only items, unknown names).
  if (clause.defaultImport || remaining.length > 0) {
    const parts: string[] = [];
    if (clause.defaultImport) parts.push(clause.defaultImport);
    if (remaining.length > 0) {
      parts.push(`{ ${remaining.map(serializeNamedItem).join(", ")} }`);
    }
    lines.push(`import ${parts.join(", ")} from "${stmt.specifier}"${tail}`);
  }

  for (const [subpath, items] of rewrites) {
    lines.push(`import { ${items.map(serializeNamedItem).join(", ")} } from "${subpath}"${tail}`);
  }

  return lines.join("\n");
};

const shouldPreserveBarrelSideEffects = (specifier: string): boolean => /^@(apps|libs)\/[^/]+\/client$/.test(specifier);

const serializeNamedItem = (item: NamedImportItem): string => {
  const prefix = item.isType ? "type " : "";
  if (item.imported === item.local) return `${prefix}${item.imported}`;
  return `${prefix}${item.imported} as ${item.local}`;
};

const loaderFor = (absPath: string): "ts" | "tsx" | "js" | "jsx" => {
  if (absPath.endsWith(".tsx")) return "tsx";
  if (absPath.endsWith(".jsx")) return "jsx";
  if (absPath.endsWith(".ts")) return "ts";
  return "js";
};

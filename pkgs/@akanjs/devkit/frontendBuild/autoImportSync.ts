import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

//* Auto-import daemon: a source-editing sibling of DevGeneratedIndexSync. When a domain file changes,
//* framework symbols that are used but not imported (e.g. `Int` in a *.constant.ts, `fetch` in a *.store.ts)
//* are inserted automatically. Detection is a closed-registry scan: we only look for a fixed, framework-owned
//* set of identifiers per file role, so no type information is required. Writes only happen on a real diff,
//* which keeps the watcher from looping on its own edits.

export interface AutoImportSyncResult {
  changedFiles: string[];
  errors: string[];
}

export interface AutoImportSyncOptions {
  workspaceRoot: string;
}

type FileRole =
  | "constant"
  | "document"
  | "service"
  | "signal"
  | "dictionary"
  | "srvkit"
  | "common"
  | "store"
  | "client";
type ImportKind = "named" | "namespace";

interface FileContext {
  role: FileRole;
  scope: "apps" | "libs";
  project: string;
}

interface ImportTarget {
  specifier: string;
  kind: ImportKind;
  //* When true, emitted as a type-only import (`import type { X }`, or inline `type X` when mixed with
  //* value names from the same specifier). Only meaningful for `kind: "named"`.
  typeOnly?: boolean;
}

//* A registry rule: the identifiers `names` should be imported from `specifier` with the given `kind`.
//* `specifier` may depend on the file's package (e.g. the client entrypoint).
interface ImportRule {
  names: string[];
  specifier: string | ((ctx: FileContext) => string);
  kind: ImportKind;
  typeOnly?: boolean;
}

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;

//* Shared rules reused across roles. Domain (`lib/<model>/`) files sit at a fixed depth, so the
//* relative barrels `../cnst`, `../db`, `../srv`, `../dict` are always correct for them.
const AKAN_BASE: ImportRule = {
  names: ["Int", "Float", "ID", "Any", "Upload", "enumOf", "dayjs"],
  specifier: "akanjs/base",
  kind: "named",
};
//* Type-only exports of akanjs/base — emitted as `type` imports (e.g. `import { type Dayjs, dayjs }`).
const AKAN_BASE_TYPES: ImportRule = { names: ["Dayjs"], specifier: "akanjs/base", kind: "named", typeOnly: true };
const CNST_NS: ImportRule = { names: ["cnst"], specifier: "../cnst", kind: "namespace" };
const DB_NS: ImportRule = { names: ["db"], specifier: "../db", kind: "namespace" };
const SRV_NS: ImportRule = { names: ["srv"], specifier: "../srv", kind: "namespace" };
const ERR_DICT: ImportRule = { names: ["Err"], specifier: "../dict", kind: "named" };

//* The closed registry, keyed by file role. Derived from an import-frequency scan across apps/libs;
//* only high-confidence, framework-owned identifiers are listed (domain model/scalar refs are resolved
//* separately). Order matters only when the same name could appear twice — keep names unique per role.
const RULES: Record<FileRole, ImportRule[]> = {
  constant: [AKAN_BASE, AKAN_BASE_TYPES, { names: ["via"], specifier: "akanjs/constant", kind: "named" }],
  document: [
    AKAN_BASE,
    AKAN_BASE_TYPES,
    CNST_NS,
    DB_NS,
    ERR_DICT,
    {
      names: ["by", "from", "into", "SchemaOf", "DataInputOf", "DocumentUpdateHelper", "documentQueryHelper", "Mdl"],
      specifier: "akanjs/document",
      kind: "named",
    },
  ],
  service: [
    AKAN_BASE,
    AKAN_BASE_TYPES,
    DB_NS,
    SRV_NS,
    CNST_NS,
    ERR_DICT,
    { names: ["serve"], specifier: "akanjs/service", kind: "named" },
    {
      names: ["DataInputOf", "ListQueryOption", "DatabaseRegistry", "getFilterInfoByKey"],
      specifier: "akanjs/document",
      kind: "named",
    },
  ],
  signal: [
    AKAN_BASE,
    AKAN_BASE_TYPES,
    SRV_NS,
    CNST_NS,
    ERR_DICT,
    {
      names: ["endpoint", "internal", "slice", "Public", "Req", "Ws", "None", "Res"],
      specifier: "akanjs/signal",
      kind: "named",
    },
  ],
  dictionary: [
    {
      names: ["modelDictionary", "scalarDictionary", "serviceDictionary"],
      specifier: "akanjs/dictionary",
      kind: "named",
    },
  ],
  srvkit: [
    AKAN_BASE,
    AKAN_BASE_TYPES,
    { names: ["Logger", "HttpClient", "sleep"], specifier: "akanjs/common", kind: "named" },
    { names: ["adapt"], specifier: "akanjs/service", kind: "named" },
    { names: ["SignalContext", "Guard", "InternalArg", "Middleware"], specifier: "akanjs/signal", kind: "named" },
  ],
  common: [AKAN_BASE, AKAN_BASE_TYPES],
  store: [
    CNST_NS,
    { names: ["store"], specifier: "akanjs/store", kind: "named" },
    { names: ["fetch", "usePage", "sig"], specifier: "../useClient", kind: "named" },
    { names: ["st"], specifier: "../st", kind: "named" },
    { names: ["RootStore"], specifier: "../st", kind: "named", typeOnly: true },
  ],
  client: [
    {
      names: ["cnst", "fetch", "st", "usePage"],
      specifier: (ctx) => `@${ctx.scope}/${ctx.project}/client`,
      kind: "named",
    },
  ],
};

//* Domain imports resolve open-ended model/scalar class refs against a per-package index, rather than
//* a fixed registry. Only these roles opt in, and each may pull from the listed sibling file kinds.
type DomainKind = "constant" | "document" | "signal";
type DomainIndex = Map<string, { file: string; kind: DomainKind }[]>;
const PASCAL_CASE_RE = /^[A-Z][A-Za-z0-9]*$/;
const DOMAIN_ROLE_KINDS: Partial<Record<FileRole, DomainKind[]>> = {
  constant: ["constant"],
  dictionary: ["constant", "document", "signal"],
  common: ["constant"],
};
//* lib barrel imports (srvkit/common): identifier -> generated `lib/<barrel>.ts` file + import shape.
//* Their specifier depth is per-file (see `#libBarrelResolver`), so they can't live in the RULES table.
const LIB_BARRELS: Record<string, { barrel: string; kind: ImportKind }> = {
  Err: { barrel: "dict", kind: "named" },
  db: { barrel: "db", kind: "namespace" },
  cnst: { barrel: "cnst", kind: "namespace" },
  srv: { barrel: "srv", kind: "namespace" },
};
//* ECMAScript/TS structural globals never resolved as domain symbols, so that a package model named
//* e.g. `Map` cannot shadow the JS `Map` used in `new Map()`. Domain-y globals like `File` are allowed
//* on purpose (they are real models here).
const DOMAIN_DENYLIST = new Set([
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Date",
  "Promise",
  "Array",
  "Object",
  "Error",
  "TypeError",
  "RangeError",
  "RegExp",
  "Symbol",
  "Proxy",
  "Reflect",
  "JSON",
  "Math",
  "Number",
  "BigInt",
  "Function",
  "Boolean",
  "String",
  "Record",
  "Partial",
  "Required",
  "Readonly",
  "Pick",
  "Omit",
  "Exclude",
  "Extract",
  "NonNullable",
  "ReturnType",
  "Parameters",
  "Awaited",
  "InstanceType",
]);

export class AutoImportSync {
  readonly #workspaceRoot: string;
  //* Per-package domain index (symbol -> source file), invalidated when a package's model file changes.
  readonly #domainCache = new Map<string, DomainIndex>();

  constructor({ workspaceRoot }: AutoImportSyncOptions) {
    this.#workspaceRoot = path.resolve(workspaceRoot);
  }

  async syncForBatch(files: string[]): Promise<AutoImportSyncResult> {
    const changedFiles: string[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    // Drop cached domain indexes for any package whose model files changed in this batch, so a newly
    // added/renamed model is visible to references resolved later in the same batch.
    for (const file of files) {
      const pkgRoot = this.#domainPkgRootOf(file);
      if (pkgRoot) this.#domainCache.delete(pkgRoot);
    }

    for (const file of files) {
      const abs = path.resolve(file);
      if (seen.has(abs)) continue;
      seen.add(abs);
      const ctx = this.#contextFor(abs);
      if (!ctx) continue;
      try {
        const changed = await this.#syncFile(abs, ctx);
        if (changed) changedFiles.push(abs);
      } catch (err) {
        errors.push(`[auto-import] sync failed for ${file}: ${formatError(err)}`);
      }
    }

    return { changedFiles, errors };
  }

  //* Resolve the role + package location for a file, or null when the file is out of scope
  //* (outside apps/libs, a generated/declaration/test file, or a facet+extension we do not handle).
  #contextFor(abs: string): FileContext | null {
    const rel = path.relative(this.#workspaceRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    const base = path.basename(abs);
    if (TEST_FILE_RE.test(base) || base === "index.ts" || base === "index.tsx" || base.endsWith(".d.ts")) return null;

    const parts = rel.split(path.sep).filter(Boolean);
    const [scope, project, facet] = parts;
    if ((scope !== "apps" && scope !== "libs") || !project || !facet) return null;
    const role = roleFor(facet, base);
    if (!role) return null;

    return { role, scope, project };
  }

  async #syncFile(abs: string, ctx: FileContext): Promise<boolean> {
    const stats = await stat(abs).catch(() => null);
    if (!stats?.isFile()) return false;
    const source = await readFile(abs, "utf8");
    const resolveExtra = await this.#extraResolverFor(abs, ctx);
    const next = transformSource(source, abs, ctx, resolveExtra);
    if (next === null || next === source) return false;
    await writeFile(abs, next);
    return true;
  }

  //* Build the dynamic resolver for identifiers the static registry does not cover, or undefined when
  //* the role has none. `srvkit`/`common` resolve the package's generated lib barrels (variable depth);
  //* the domain roles resolve open-ended model/scalar refs against the per-package index. `common`
  //* uses both — barrels first, then domain (the two symbol sets are disjoint).
  async #extraResolverFor(abs: string, ctx: FileContext) {
    const resolvers: ((symbol: string) => ImportTarget | null)[] = [];
    if (ctx.role === "srvkit" || ctx.role === "common") resolvers.push(await this.#libBarrelResolver(abs, ctx));
    const kinds = DOMAIN_ROLE_KINDS[ctx.role];
    if (kinds) resolvers.push(await this.#domainResolver(abs, ctx, kinds));
    if (resolvers.length === 0) return undefined;
    return (symbol: string): ImportTarget | null => {
      for (const resolve of resolvers) {
        const target = resolve(symbol);
        if (target) return target;
      }
      return null;
    };
  }

  //* Resolve an unbound PascalCase identifier to a relative import of the package model/scalar that
  //* exports it (only when exactly one package file of an allowed kind exports that name).
  async #domainResolver(abs: string, ctx: FileContext, kinds: DomainKind[]) {
    const index = await this.#domainIndex(path.join(this.#workspaceRoot, ctx.scope, ctx.project));
    const fileDir = path.dirname(abs);
    return (symbol: string): ImportTarget | null => {
      if (!PASCAL_CASE_RE.test(symbol) || DOMAIN_DENYLIST.has(symbol)) return null;
      const entries = (index.get(symbol) ?? []).filter((entry) => kinds.includes(entry.kind));
      if (entries.length !== 1) return null; // unknown or ambiguous → leave it alone
      return { specifier: relativeSpecifier(fileDir, entries[0].file), kind: "named" };
    };
  }

  //* srvkit/common files import the package's generated lib barrels from a variable depth
  //* (`../lib/dict`, `../../lib/dict`, …). Resolve each barrel name to a path relative to this file,
  //* but only for barrels that actually exist (so an absent `lib/srv.ts` never yields a broken import).
  async #libBarrelResolver(abs: string, ctx: FileContext) {
    const fileDir = path.dirname(abs);
    const libDir = path.join(this.#workspaceRoot, ctx.scope, ctx.project, "lib");
    const available = new Map<string, ImportTarget>();
    for (const [symbol, { barrel, kind }] of Object.entries(LIB_BARRELS)) {
      if (await fileExists(path.join(libDir, `${barrel}.ts`)))
        available.set(symbol, { specifier: relativeSpecifier(fileDir, path.join(libDir, barrel)), kind });
    }
    return (symbol: string): ImportTarget | null => available.get(symbol) ?? null;
  }

  async #domainIndex(pkgRoot: string): Promise<DomainIndex> {
    const cached = this.#domainCache.get(pkgRoot);
    if (cached) return cached;
    const index = await buildDomainIndex(path.join(pkgRoot, "lib"));
    this.#domainCache.set(pkgRoot, index);
    return index;
  }

  //* The apps/libs package root for a model file (`*.constant/document/signal.ts` under `lib/`), else null.
  #domainPkgRootOf(file: string): string | null {
    const rel = path.relative(this.#workspaceRoot, path.resolve(file));
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    const [scope, project, facet] = rel.split(path.sep).filter(Boolean);
    if ((scope !== "apps" && scope !== "libs") || !project || facet !== "lib") return null;
    if (!domainKindOf(path.basename(file))) return null;
    return path.join(this.#workspaceRoot, scope, project);
  }
}

//* Which facet+extension combinations get auto-imports, and the role that drives their registry.
//* `client` covers every file that pulls domain symbols from the package client entrypoint:
//* lib UI (.tsx), the `ui`/`page` facets (.tsx), and the `webkit` facet (.ts/.tsx).
const roleFor = (facet: string, base: string): FileRole | null => {
  if (facet === "lib") {
    if (base.endsWith(".constant.ts")) return "constant";
    if (base.endsWith(".document.ts")) return "document";
    if (base.endsWith(".service.ts")) return "service";
    if (base.endsWith(".signal.ts")) return "signal";
    if (base.endsWith(".dictionary.ts")) return "dictionary";
    if (base.endsWith(".store.ts")) return "store";
    if (base.endsWith(".tsx")) return "client";
    return null;
  }
  if (facet === "ui" || facet === "page") return base.endsWith(".tsx") ? "client" : null;
  if (facet === "webkit") return base.endsWith(".ts") || base.endsWith(".tsx") ? "client" : null;
  if (facet === "srvkit") return base.endsWith(".ts") ? "srvkit" : null;
  if (facet === "common") return base.endsWith(".ts") || base.endsWith(".tsx") ? "common" : null;
  return null;
};

const targetFor = (symbol: string, ctx: FileContext): ImportTarget | null => {
  for (const rule of RULES[ctx.role]) {
    if (!rule.names.includes(symbol)) continue;
    const specifier = typeof rule.specifier === "function" ? rule.specifier(ctx) : rule.specifier;
    return { specifier, kind: rule.kind, typeOnly: rule.typeOnly };
  }
  return null;
};

//* Returns the rewritten source, or null when nothing needs to change. `resolveExtra` (when supplied)
//* handles identifiers not matched by the framework registry — domain model refs and srvkit barrels.
export const transformSource = (
  source: string,
  fileName: string,
  ctx: FileContext,
  resolveExtra?: (symbol: string) => ImportTarget | null,
): string | null => {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const bound = collectBoundNames(sf);
  const used = collectUsedReferences(sf);

  // Group the needed symbols by their import target: framework registry first, then dynamic resolver.
  // Named groups map each name to whether it is type-only, so we can emit `import type`/inline `type`.
  const namedBySpecifier = new Map<string, Map<string, boolean>>();
  const namespaceImports: { name: string; specifier: string }[] = [];
  for (const name of used) {
    if (bound.has(name)) continue;
    const target = targetFor(name, ctx) ?? resolveExtra?.(name) ?? null;
    if (!target) continue;
    if (target.kind === "namespace") namespaceImports.push({ name, specifier: target.specifier });
    else {
      const names = namedBySpecifier.get(target.specifier) ?? new Map<string, boolean>();
      names.set(name, target.typeOnly ?? false);
      namedBySpecifier.set(target.specifier, names);
    }
  }
  if (namedBySpecifier.size === 0 && namespaceImports.length === 0) return null;

  const importDecls = sf.statements.filter(ts.isImportDeclaration);
  const anchor = importDecls.at(-1) ?? null;
  const namedImportsBySpecifier = collectExistingNamedImports(importDecls);

  const edits: { start: number; end: number; text: string }[] = [];
  const newStatements: string[] = [];

  for (const [specifier, names] of namedBySpecifier) {
    const existing = namedImportsBySpecifier.get(specifier);
    if (existing) {
      const merged = new Map(existing.names);
      for (const [name, isType] of names) if (!merged.has(name)) merged.set(name, isType);
      edits.push({
        start: existing.decl.getStart(sf),
        end: existing.decl.getEnd(),
        text: formatNamedImport(specifier, merged),
      });
    } else newStatements.push(formatNamedImport(specifier, names));
  }
  for (const ns of namespaceImports) newStatements.push(`import * as ${ns.name} from "${ns.specifier}";`);

  if (newStatements.length > 0) {
    // If the anchor import is itself being merged, fold the new lines into that edit to avoid a
    // zero-width insertion sharing a boundary with the merge replacement.
    const anchorEdit = anchor ? edits.find((edit) => edit.start === anchor.getStart(sf)) : undefined;
    if (anchorEdit) anchorEdit.text = `${anchorEdit.text}\n${newStatements.join("\n")}`;
    else if (anchor)
      edits.push({ start: anchor.getEnd(), end: anchor.getEnd(), text: `\n${newStatements.join("\n")}` });
    else {
      const prologueEnd = directivePrologueEnd(sf);
      if (prologueEnd >= 0) edits.push({ start: prologueEnd, end: prologueEnd, text: `\n${newStatements.join("\n")}` });
      else edits.push({ start: 0, end: 0, text: `${newStatements.join("\n")}\n\n` });
    }
  }
  if (edits.length === 0) return null;

  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out === source ? null : out;
};

//* Every name introduced into scope: import bindings plus local declarations. Over-collecting only
//* suppresses an insertion (safe); under-collecting would risk a duplicate import (unsafe).
const collectBoundNames = (sf: ts.SourceFile): Set<string> => {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportClause(node)) {
      if (node.name) names.add(node.name.text);
      const bindings = node.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) names.add(el.name.text);
    }
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isBindingElement(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    )
      names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return names;
};

const collectUsedReferences = (sf: ts.SourceFile): Set<string> => {
  const used = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && isReferencePosition(node)) used.add(node.text);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return used;
};

//* True when the identifier reads a binding, as opposed to being a member name, property key, or
//* declaration name. e.g. in `cnst.Coordinate`, `cnst` is a reference but `Coordinate` is not.
const isReferencePosition = (node: ts.Identifier): boolean => {
  const parent = node.parent;
  if (!parent) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isQualifiedName(parent) && parent.right === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isPropertySignature(parent) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  return true;
};

interface ExistingNamedImport {
  decl: ts.ImportDeclaration;
  names: Map<string, boolean>; // name -> type-only (whole-clause `import type` or inline `type`)
}

const collectExistingNamedImports = (importDecls: ts.ImportDeclaration[]): Map<string, ExistingNamedImport> => {
  const map = new Map<string, ExistingNamedImport>();
  for (const decl of importDecls) {
    const clause = decl.importClause;
    const bindings = clause?.namedBindings;
    if (!clause || !bindings || !ts.isNamedImports(bindings)) continue;
    if (!ts.isStringLiteral(decl.moduleSpecifier)) continue;
    const specifier = decl.moduleSpecifier.text;
    if (map.has(specifier)) continue; // first same-specifier named import wins as the merge site
    const names = new Map<string, boolean>();
    for (const el of bindings.elements) names.set(el.name.text, clause.isTypeOnly || el.isTypeOnly);
    map.set(specifier, { decl, names });
  }
  return map;
};

//* Render a named import, hoisting to `import type { … }` when every name is type-only and otherwise
//* prefixing each type-only name with inline `type`. Names sorted case-insensitively (Biome order).
const formatNamedImport = (specifier: string, names: Map<string, boolean>): string => {
  const entries = [...names.entries()].sort((a, b) => compareNames(a[0], b[0]));
  if (entries.every(([, isType]) => isType))
    return `import type { ${entries.map(([name]) => name).join(", ")} } from "${specifier}";`;
  const parts = entries.map(([name, isType]) => (isType ? `type ${name}` : name));
  return `import { ${parts.join(", ")} } from "${specifier}";`;
};

const directivePrologueEnd = (sf: ts.SourceFile): number => {
  let end = -1;
  for (const stmt of sf.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) end = stmt.getEnd();
    else break;
  }
  return end;
};

const scriptKindFor = (fileName: string) => (fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

//* Case-insensitive primary order with a case-sensitive tie-break (uppercase first), matching Biome's
//* import specifier sort — so e.g. `Dayjs` precedes `dayjs`.
const compareNames = (a: string, b: string): number => {
  const [la, lb] = [a.toLowerCase(), b.toLowerCase()];
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

const formatError = (err: unknown) => (err instanceof Error ? err.message : String(err));

const fileExists = async (file: string) =>
  stat(file)
    .then((s) => s.isFile())
    .catch(() => false);

// ---- Domain index ---------------------------------------------------------------------------------

const domainKindOf = (base: string): DomainKind | null => {
  if (base.endsWith(".constant.ts")) return "constant";
  if (base.endsWith(".document.ts")) return "document";
  if (base.endsWith(".signal.ts")) return "signal";
  return null;
};

//* Scan a package `lib/` for model files and index their exported PascalCase declarations.
const buildDomainIndex = async (libDir: string): Promise<DomainIndex> => {
  const index: DomainIndex = new Map();
  for (const file of await collectDomainFiles(libDir)) {
    const kind = domainKindOf(path.basename(file));
    if (!kind) continue;
    const src = await readFile(file, "utf8").catch(() => null);
    if (src === null) continue;
    for (const name of exportedPascalNames(src, file)) {
      const entries = index.get(name) ?? [];
      entries.push({ file, kind });
      index.set(name, entries);
    }
  }
  return index;
};

const collectDomainFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectDomainFiles(full)));
    else if (domainKindOf(entry.name) && !TEST_FILE_RE.test(entry.name)) files.push(full);
  }
  return files;
};

const exportedPascalNames = (source: string, fileName: string): string[] => {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const names: string[] = [];
  for (const stmt of sf.statements) {
    if ((ts.isClassDeclaration(stmt) || ts.isFunctionDeclaration(stmt) || ts.isEnumDeclaration(stmt)) && stmt.name) {
      if (isExported(stmt)) names.push(stmt.name.text);
    } else if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) if (ts.isIdentifier(decl.name)) names.push(decl.name.text);
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) names.push(el.name.text);
    }
  }
  return names.filter((name) => PASCAL_CASE_RE.test(name));
};

//* Relative module specifier from a file's directory to a target file, extension stripped, `./`-anchored.
const relativeSpecifier = (fromDir: string, toFile: string): string => {
  const rel = path
    .relative(fromDir, toFile)
    .replace(/\.tsx?$/, "")
    .split(path.sep)
    .join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
};

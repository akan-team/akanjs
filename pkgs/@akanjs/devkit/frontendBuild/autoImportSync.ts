import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { FileSys } from "../util/fileSys";

//* Closed-registry scan (no type information); writes only on a real diff, or the watcher loops on its own edits.

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
  typeOnly?: boolean;
}

interface ImportRule {
  names: string[];
  specifier: string | ((ctx: FileContext) => string);
  kind: ImportKind;
  typeOnly?: boolean;
}

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;

//* Domain files sit at a fixed depth (`lib/<model>/`), so the relative barrels below are always correct for them.
const AKAN_BASE: ImportRule = {
  names: ["Int", "Float", "ID", "Any", "Upload", "enumOf", "dayjs"],
  specifier: "akanjs/base",
  kind: "named",
};
const AKAN_BASE_TYPES: ImportRule = { names: ["Dayjs"], specifier: "akanjs/base", kind: "named", typeOnly: true };
const CNST_NS: ImportRule = { names: ["cnst"], specifier: "../cnst", kind: "namespace" };
const DB_NS: ImportRule = { names: ["db"], specifier: "../db", kind: "namespace" };
const SRV_NS: ImportRule = { names: ["srv"], specifier: "../srv", kind: "namespace" };
const ERR_DICT: ImportRule = { names: ["Err"], specifier: "../dict", kind: "named" };

//* Keep names unique per role: targetFor takes the first rule that lists a name.
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

type DomainKind = "constant" | "document" | "signal";
type DomainIndex = Map<string, { file: string; kind: DomainKind }[]>;
const PASCAL_CASE_RE = /^[A-Z][A-Za-z0-9]*$/;
const DOMAIN_ROLE_KINDS: Partial<Record<FileRole, DomainKind[]>> = {
  constant: ["constant"],
  dictionary: ["constant", "document", "signal"],
  common: ["constant"],
};
//* srvkit/common import the lib barrels from a per-file depth, so they cannot live in the RULES table.
const LIB_BARRELS: Record<string, { barrel: string; kind: ImportKind }> = {
  Err: { barrel: "dict", kind: "named" },
  db: { barrel: "db", kind: "namespace" },
  cnst: { barrel: "cnst", kind: "namespace" },
  srv: { barrel: "srv", kind: "namespace" },
};
//* Importing Akan's `fetch` over the platform global silently rebinds `fetch(url)`, so such a name is claimed
//* only when every reference is member-shaped (`fetch.viewX()`).
const GLOBAL_NAMES = new Set(["fetch"]);
//* Structural globals a package model must not shadow (`new Map()`); `File` is left out on purpose — it is a real model.
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
  readonly #domainCache = new Map<string, DomainIndex>();

  constructor({ workspaceRoot }: AutoImportSyncOptions) {
    this.#workspaceRoot = path.resolve(workspaceRoot);
  }

  async syncForBatch(files: string[]): Promise<AutoImportSyncResult> {
    const changedFiles: string[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

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

  #contextFor(abs: string): FileContext | null {
    const rel = path.relative(this.#workspaceRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    const base = path.basename(abs);
    if (TEST_FILE_RE.test(base) || base === "index.ts" || base === "index.tsx" || base.endsWith(".d.ts")) return null;

    const parts = rel.split(path.sep).filter(Boolean);
    const [scope, project, facet] = parts;
    if ((scope !== "apps" && scope !== "libs") || !project || !facet) return null;
    //* `lib/__lib/` is rewritten by every `akan sync`, so an edit there is discarded; `lib/__scalar/` is real source.
    if (facet === "lib" && parts[3] === "__lib") return null;
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
    await FileSys.writeTextAtomic(abs, next);
    return true;
  }

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

  async #domainResolver(abs: string, ctx: FileContext, kinds: DomainKind[]) {
    const index = await this.#domainIndex(path.join(this.#workspaceRoot, ctx.scope, ctx.project));
    const fileDir = path.dirname(abs);
    return (symbol: string): ImportTarget | null => {
      if (!PASCAL_CASE_RE.test(symbol) || DOMAIN_DENYLIST.has(symbol)) return null;
      const entries = (index.get(symbol) ?? []).filter((entry) => kinds.includes(entry.kind));
      if (entries.length !== 1) return null;
      return { specifier: relativeSpecifier(fileDir, entries[0].file), kind: "named" };
    };
  }

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

  #domainPkgRootOf(file: string): string | null {
    const rel = path.relative(this.#workspaceRoot, path.resolve(file));
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    const [scope, project, facet] = rel.split(path.sep).filter(Boolean);
    if ((scope !== "apps" && scope !== "libs") || !project || facet !== "lib") return null;
    if (!domainKindOf(path.basename(file))) return null;
    return path.join(this.#workspaceRoot, scope, project);
  }
}

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

/** The rewritten source, or null when nothing changes. */
export const transformSource = (
  source: string,
  fileName: string,
  ctx: FileContext,
  resolveExtra?: (symbol: string) => ImportTarget | null,
): string | null => {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const bound = collectBoundNames(sf);
  const used = collectUsedReferences(sf);
  const bareGlobals = collectBareGlobalReferences(sf);

  const namedBySpecifier = new Map<string, Map<string, boolean>>();
  const namespaceImports: { name: string; specifier: string }[] = [];
  for (const name of used) {
    if (bound.has(name) || bareGlobals.has(name)) continue;
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
    // A zero-width insertion at the anchor's boundary would collide with the anchor's own merge edit.
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

//* Over-collecting only suppresses an insertion; under-collecting would add a duplicate import.
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

const collectBareGlobalReferences = (sf: ts.SourceFile): Set<string> => {
  const bare = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && GLOBAL_NAMES.has(node.text) && isReferencePosition(node)) {
      const parent = node.parent;
      if (!(parent && ts.isPropertyAccessExpression(parent) && parent.expression === node)) bare.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return bare;
};

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
  names: Map<string, boolean>;
}

const collectExistingNamedImports = (importDecls: ts.ImportDeclaration[]): Map<string, ExistingNamedImport> => {
  const map = new Map<string, ExistingNamedImport>();
  for (const decl of importDecls) {
    const clause = decl.importClause;
    const bindings = clause?.namedBindings;
    if (!clause || !bindings || !ts.isNamedImports(bindings)) continue;
    if (!ts.isStringLiteral(decl.moduleSpecifier)) continue;
    const specifier = decl.moduleSpecifier.text;
    if (map.has(specifier)) continue;
    const names = new Map<string, boolean>();
    for (const el of bindings.elements) names.set(el.name.text, clause.isTypeOnly || el.isTypeOnly);
    map.set(specifier, { decl, names });
  }
  return map;
};

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

// Matches Biome's import-specifier sort: case-insensitive, uppercase first on a tie (`Dayjs` before `dayjs`).
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

const domainKindOf = (base: string): DomainKind | null => {
  if (base.endsWith(".constant.ts")) return "constant";
  if (base.endsWith(".document.ts")) return "document";
  if (base.endsWith(".signal.ts")) return "signal";
  return null;
};

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

const relativeSpecifier = (fromDir: string, toFile: string): string => {
  const rel = path
    .relative(fromDir, toFile)
    .replace(/\.tsx?$/, "")
    .split(path.sep)
    .join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
};

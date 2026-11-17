import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export interface RuntimeMarkerPin {
  page: string;
  //? From the page or layout file to the framework file importing the marker, each a workspace or `akanjs/` path.
  chain: string[];
}

const markerFile = /(?:^|\/)akanjs\/ui\/modelRuntime\.ts$/;
const pageFile = /^((?:apps|libs)\/[^/]+\/page)\/(?:.+\/)?[^/]+\.tsx$/;
const useClientDirective = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;
const suffixes = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const typeOnly = "";

const readFile = (absPath: string) => {
  try {
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
};

//* Which pages load the whole client runtime because a framework UI component that reads models by name is on them:
//* the imports from a page or its layouts to a file importing `akanjs/ui/modelRuntime`, past a `"use client"` file.
export class RuntimeMarkerReach {
  static readonly rule = "akan.runtime.framework-marker";
  readonly #workspaceRoot: string;
  readonly #read: (absPath: string) => string | null;
  readonly #sources = new Map<string, ts.SourceFile | null>();
  readonly #imports = new Map<string, string[]>();
  readonly #resolved = new Map<string, string | null>();
  #akanjsRoot: string | null | undefined;

  constructor(workspaceRoot: string, read: (absPath: string) => string | null = readFile) {
    this.#workspaceRoot = workspaceRoot;
    this.#read = read;
  }

  static pagesOf(files: string[]): Map<string, string[]> {
    const known = new Set(files);
    const pages = new Map<string, string[]>();
    for (const file of files) {
      const [, pageRoot] = file.match(pageFile) ?? [];
      if (!pageRoot || path.posix.basename(file) === "_layout.tsx") continue;
      const dirs = path.posix.dirname(file).slice(pageRoot.length).split("/").filter(Boolean);
      const layouts = dirs
        .map((_, index) => `${[pageRoot, ...dirs.slice(0, index + 1)].join("/")}/_layout.tsx`)
        .concat(`${pageRoot}/_layout.tsx`)
        .filter((layout) => known.has(layout));
      pages.set(file, [file, ...layouts.sort()]);
    }
    return pages;
  }

  pinsOf(files: string[]): RuntimeMarkerPin[] {
    const pins: RuntimeMarkerPin[] = [];
    for (const [page, roots] of RuntimeMarkerReach.pagesOf(files)) {
      const chain = this.#chainFrom(roots.map((root) => path.join(this.#workspaceRoot, root)));
      if (chain) pins.push({ page, chain: chain.map((file) => this.#nameOf(file)) });
    }
    return pins;
  }

  static format(pins: RuntimeMarkerPin[]): string[] {
    const groups = new Map<string, { chain: string[]; pages: string[] }>();
    for (const { page, chain } of pins) {
      const from = Math.max(0, chain.findIndex((file) => file.startsWith("akanjs/")) - 1);
      const tail = chain.slice(from);
      const group = groups.get(tail.join("\n")) ?? { chain: tail, pages: [] };
      group.pages.push(page);
      groups.set(tail.join("\n"), group);
    }
    return [...groups.values()].map(({ chain, pages }) => {
      const more = pages.length > 3 ? ` and ${pages.length - 3} more` : "";
      return `${chain[0]} - note ${RuntimeMarkerReach.rule}: reaches a framework component that reads models by name (${chain.join(" → ")}). ${pages.length} ${pages.length === 1 ? "page loads" : "pages load"} the whole client runtime through it: ${pages.slice(0, 3).join(", ")}${more}.`;
    });
  }

  #nameOf(absPath: string) {
    const akanjsRoot = this.#akanjs();
    const inPackage = akanjsRoot && !path.relative(akanjsRoot, absPath).startsWith("..");
    const name = inPackage
      ? path.join("akanjs", path.relative(akanjsRoot, absPath))
      : path.relative(this.#workspaceRoot, absPath);
    return name.split(path.sep).join("/");
  }

  #akanjs(): string | null {
    if (this.#akanjsRoot !== undefined) return this.#akanjsRoot;
    const roots = ["node_modules/akanjs", "pkgs/akanjs"].map((dir) => path.join(this.#workspaceRoot, dir));
    this.#akanjsRoot = roots.find((dir) => this.#read(path.join(dir, "ui/modelRuntime.ts")) !== null) ?? null;
    return this.#akanjsRoot;
  }

  #chainFrom(roots: string[]): string[] | null {
    const keyOf = (file: string, client: boolean) => `${client ? "client" : "server"}:${file}`;
    const parents = new Map<string, string | null>();
    const queue: { file: string; client: boolean }[] = [];
    const visit = (file: string, client: boolean, parent: string | null) => {
      if (parents.has(keyOf(file, client))) return;
      parents.set(keyOf(file, client), parent);
      queue.push({ file, client });
    };
    for (const root of roots) visit(root, this.#isClient(root), null);
    for (const { file, client } of queue)
      for (const imported of this.#importsOf(file)) {
        if (!markerFile.test(this.#nameOf(imported)))
          visit(imported, client || this.#isClient(imported), keyOf(file, client));
        else if (client) {
          const chain: string[] = [];
          for (let key: string | null = keyOf(file, client); key; key = parents.get(key) ?? null)
            chain.unshift(key.slice(key.indexOf(":") + 1));
          return chain;
        }
      }
    return null;
  }

  #isClient(absPath: string) {
    return useClientDirective.test(this.#read(absPath) ?? "");
  }

  #sourceOf(absPath: string): ts.SourceFile | null {
    const known = this.#sources.get(absPath);
    if (known !== undefined) return known;
    const text = this.#read(absPath);
    const kind = absPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = text === null ? null : ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, false, kind);
    this.#sources.set(absPath, source);
    return source;
  }

  #resolve(specifier: string, importer: string): string | null {
    const akanjsRoot = this.#akanjs();
    const base = specifier.startsWith(".")
      ? path.resolve(path.dirname(importer), specifier)
      : /^@(?:apps|libs)\//.test(specifier)
        ? path.join(this.#workspaceRoot, specifier.slice(1))
        : akanjsRoot && /^akanjs(?:\/|$)/.test(specifier)
          ? path.join(akanjsRoot, specifier.slice("akanjs".length))
          : null;
    if (!base) return null;
    const known = this.#resolved.get(base);
    if (known !== undefined) return known;
    const found = suffixes.map((suffix) => `${base}${suffix}`).find((file) => this.#read(file) !== null) ?? null;
    this.#resolved.set(base, found);
    return found;
  }

  #importsOf(absPath: string): string[] {
    const known = this.#imports.get(absPath);
    if (known) return known;
    const imports = new Set<string>();
    this.#imports.set(absPath, []);
    const follow = (specifier: ts.Expression, names: string[] | null) => {
      const target = ts.isStringLiteral(specifier) ? this.#resolve(specifier.text, absPath) : null;
      if (!target) return;
      for (const name of names ?? [null]) {
        const holder = name === null ? target : (this.#exporterOf(target, name, new Set()) ?? target);
        if (holder !== typeOnly) imports.add(holder);
      }
    };
    for (const statement of this.#sourceOf(absPath)?.statements ?? []) {
      if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly) {
        const { name, namedBindings } = statement.importClause ?? {};
        const named = !name && namedBindings && ts.isNamedImports(namedBindings) ? namedBindings.elements : null;
        const names = named
          ?.filter((element) => !element.isTypeOnly)
          .map((element) => (element.propertyName ?? element.name).text);
        if (!names || names.length > 0) follow(statement.moduleSpecifier, names ?? null);
      } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
        const named =
          statement.exportClause && ts.isNamedExports(statement.exportClause) ? statement.exportClause : null;
        const names = named?.elements
          .filter((element) => !element.isTypeOnly)
          .map((element) => (element.propertyName ?? element.name).text);
        follow(statement.moduleSpecifier, names ?? null);
      }
    }
    const result = [...imports];
    this.#imports.set(absPath, result);
    return result;
  }

  //? The file a name imported from `absPath` comes from: a re-export is followed, as the build narrows a barrel import.
  #exporterOf(absPath: string, name: string, seen: Set<string>): string | null {
    if (seen.has(absPath)) return null;
    seen.add(absPath);
    const statements = this.#sourceOf(absPath)?.statements ?? [];
    const stars: string[] = [];
    for (const statement of statements) {
      if (ts.isExportDeclaration(statement)) {
        const target =
          statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
            ? this.#resolve(statement.moduleSpecifier.text, absPath)
            : null;
        if (!statement.exportClause && target) stars.push(target);
        const { exportClause } = statement;
        if (exportClause && ts.isNamespaceExport(exportClause) && exportClause.name.text === name)
          return target ?? absPath;
        const elements =
          statement.exportClause && ts.isNamedExports(statement.exportClause) ? statement.exportClause.elements : [];
        const element = elements.find((candidate) => candidate.name.text === name);
        if (!element) continue;
        if (statement.isTypeOnly || element.isTypeOnly) return typeOnly;
        const source = (element.propertyName ?? element.name).text;
        if (target) return this.#exporterOf(target, source, seen) ?? target;
        return statement.moduleSpecifier ? absPath : (this.#importedFrom(absPath, source, seen) ?? absPath);
      }
      const exported =
        ts.canHaveModifiers(statement) &&
        ts.getModifiers(statement)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      if (
        (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
        statement.name.text === name
      )
        return typeOnly;
      const declared = ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.some(
            ({ name: binding }) => !ts.isIdentifier(binding) || binding.text === name,
          )
        : (ts.isFunctionDeclaration(statement) ||
            ts.isClassDeclaration(statement) ||
            ts.isEnumDeclaration(statement)) &&
          statement.name?.text === name;
      if (declared) return absPath;
    }
    for (const star of stars) {
      const holder = this.#exporterOf(star, name, seen);
      if (holder !== null) return holder;
    }
    return null;
  }

  #importedFrom(absPath: string, local: string, seen: Set<string>): string | null {
    for (const statement of this.#sourceOf(absPath)?.statements ?? []) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const { namedBindings } = statement.importClause ?? {};
      const elements = namedBindings && ts.isNamedImports(namedBindings) ? namedBindings.elements : [];
      const element = elements.find((candidate) => candidate.name.text === local);
      const target = element ? this.#resolve(statement.moduleSpecifier.text, absPath) : null;
      if (element && target)
        return this.#exporterOf(target, (element.propertyName ?? element.name).text, seen) ?? target;
    }
    return null;
  }
}

import fs from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { BunPlugin } from "bun";
import ts from "typescript";
import type { App } from "../commandDecorators";
import type { NamedItem } from "./moduleSyntax";

type Pipe = (source: string, args: { path: string }) => string | Promise<string | null> | null;
type Census = Map<string, Map<string, Set<string>>>;

interface IconSet {
  file: string;
  text: string;
  spans: Map<string, [number, number]>;
  outDir: string;
  lib: string;
}

interface SetImport {
  start: number;
  end: number;
  specifier: string;
  named: NamedItem[];
}

//* An icon lives in one module only, so a route downloads it once and never more of a set than the set's own module.
//? Not one module per importer: an icon n files name was downloaded n times. Not one per set of naming files, nor
//? per icon: the sub-kilobyte chunks that made were served unbrotlied and outweighed the bytes saved.
export class ReactIconImports {
  static readonly #specifier = /^react-icons\/[\w-]+$/;
  //? The package generates every set as this one import followed by one `export function` per icon.
  static readonly #header = "import { GenIcon } from '../lib/index.mjs';";
  static readonly #iconStart = /^export function ([A-Za-z_$][\w$]*) \(props\) \{$/gm;
  static readonly #iconBody = /^export function [\w$]+ \(props\) \{\n {2}return GenIcon\(\{.*\}\)\(props\);\n\};\n*$/;
  static readonly #source = /\.(?:tsx?|jsx?|mjs)$/;
  readonly #outRoot: string;
  readonly #appDir: string | null;
  readonly #roots: string[];
  #census: Promise<Census> | null = null;
  readonly #setFiles = new Map<string, string | null>();
  readonly #sets = new Map<string, Promise<IconSet | null>>();
  readonly #groups = new Map<string, Map<string, string[]>>();
  readonly #files = new Map<string, Promise<string | null>>();
  readonly #contents = new Map<string, string>();

  constructor(outRoot: string, appDir: string | null = null, sharedDirs: string[] = []) {
    this.#outRoot = outRoot;
    this.#appDir = appDir === null ? null : ReactIconImports.#realPathOf(appDir);
    this.#roots = [...(appDir === null ? [] : [appDir]), ...sharedDirs];
  }

  static forApp(app: App): ReactIconImports {
    const { workspaceRoot } = app.workspace;
    return new ReactIconImports(path.join(app.cwdPath, ".akan", "generated", "react-icons"), app.cwdPath, [
      path.join(workspaceRoot, "libs"),
      ReactIconImports.#packageDirOf("akanjs", workspaceRoot),
    ]);
  }

  static #packageDirOf(name: string, from: string): string {
    try {
      return path.dirname(Bun.resolveSync(`${name}/package.json`, from));
    } catch {
      return path.join(from, "node_modules", name);
    }
  }

  //? Bun's resolver caches a folder's listing, so an icon file written later in the same build cannot be resolved.
  get plugin(): BunPlugin {
    const filter = new RegExp(`^${this.#outRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\\\/]`);
    return {
      name: "react-icon-imports",
      setup: (build) => {
        build.onResolve({ filter }, (args) => ({ path: args.path }));
        build.onLoad({ filter }, (args) => {
          const contents = this.#contents.get(args.path);
          return contents === undefined ? undefined : { contents, loader: "js" };
        });
      },
    };
  }

  pipe(next?: Pipe): Pipe {
    return async (source, args) => {
      const rewritten = await this.rewrite(source, args.path);
      const piped = next ? await next(rewritten ?? source, args) : null;
      return piped ?? rewritten;
    };
  }

  //? Every replacement keeps the statement's line count, so the importer's source map still lines up.
  async rewrite(source: string, importer: string): Promise<string | null> {
    if (!source.includes("react-icons/")) return null;
    let out = source;
    for (const statement of ReactIconImports.#importsOf(source, importer).reverse()) {
      const set = await this.#setOf(statement.specifier, importer);
      if (!set) continue;
      const kept: NamedItem[] = [];
      const moved = new Map<string, NamedItem[]>();
      for (const item of statement.named) {
        const file = item.isType ? null : await this.#moduleOf(set, item.imported);
        if (file) moved.set(file, [...(moved.get(file) ?? []), item]);
        else kept.push(item);
      }
      if (moved.size === 0) continue;
      const lines = [...moved].map(
        ([file, items]) => `import { ${items.map(ReactIconImports.#named).join(", ")} } from ${JSON.stringify(file)};`,
      );
      if (kept.length > 0) lines.unshift(ReactIconImports.#keptImport(kept, statement.specifier));
      const newlines = source.slice(statement.start, statement.end).split("\n").length - 1;
      out = `${out.slice(0, statement.start)}${lines.join(" ")}${"\n".repeat(newlines)}${out.slice(statement.end)}`;
    }
    return out === source ? null : out;
  }

  async moduleOf(specifier: string, name: string, importer: string): Promise<string | null> {
    const set = await this.#setOf(specifier, importer);
    return set ? await this.#moduleOf(set, name) : null;
  }

  async #moduleOf(set: IconSet, name: string): Promise<string | null> {
    if (!ReactIconImports.#bodyOf(set, name)) return null;
    const census = await this.#censusOf();
    const namers = census.get(set.file)?.get(name);
    if (!namers) return await this.#fileOf(set, `\0${name}`, [name]);
    const key = this.#keyOf(namers);
    return await this.#fileOf(set, key, this.#groupsOf(set, census).get(key) ?? [name]);
  }

  #groupsOf(set: IconSet, census: Census): Map<string, string[]> {
    let groups = this.#groups.get(set.file);
    if (!groups) {
      groups = new Map();
      for (const [name, namers] of census.get(set.file) ?? []) {
        if (!ReactIconImports.#bodyOf(set, name)) continue;
        const key = this.#keyOf(namers);
        groups.set(key, [...(groups.get(key) ?? []), name]);
      }
      this.#groups.set(set.file, groups);
    }
    return groups;
  }

  #keyOf(namers: Set<string>): string {
    if (namers.size === 1) return [...namers].join("");
    const own = this.#appDir === null ? null : `${this.#appDir}${path.sep}`;
    return own !== null && [...namers].every((file) => file.startsWith(own)) ? "\0app" : "\0shared";
  }

  #censusOf(): Promise<Census> {
    this.#census ??= this.#readCensus();
    return this.#census;
  }

  async #readCensus(): Promise<Census> {
    const census: Census = new Map();
    const roots = [...new Set(this.#roots.flatMap((root) => ReactIconImports.#realPathOrNot(root) ?? []))];
    const files = (await Promise.all(roots.map((root) => ReactIconImports.#sourcesUnder(root)))).flat();
    await Promise.all(
      [...new Set(files)].map(async (file) => {
        const source = await Bun.file(file)
          .text()
          .catch(() => "");
        if (!source.includes("react-icons/")) return;
        for (const statement of ReactIconImports.#importsOf(source, file)) {
          const setFile = this.#setFileOf(statement.specifier, file);
          if (!setFile) continue;
          const names = census.get(setFile) ?? new Map<string, Set<string>>();
          census.set(setFile, names);
          for (const item of statement.named)
            if (!item.isType) names.set(item.imported, (names.get(item.imported) ?? new Set()).add(file));
        }
      }),
    );
    return census;
  }

  static async #sourcesUnder(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const nested = await Promise.all(
      entries.map((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
          return entry.name === "node_modules" || entry.name.startsWith(".")
            ? []
            : ReactIconImports.#sourcesUnder(full);
        return entry.isFile() && ReactIconImports.#source.test(entry.name) && !entry.name.endsWith(".d.ts")
          ? [full]
          : [];
      }),
    );
    return nested.flat();
  }

  static #realPathOrNot(file: string): string | null {
    try {
      return fs.realpathSync(file);
    } catch {
      return null;
    }
  }

  static #realPathOf(file: string): string {
    return ReactIconImports.#realPathOrNot(file) ?? file;
  }

  static #importsOf(source: string, importer: string): SetImport[] {
    const kind = importer.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : importer.endsWith(".ts")
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JSX;
    const sourceFile = ts.createSourceFile(importer, source, ts.ScriptTarget.Latest, false, kind);
    const found: SetImport[] = [];
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || statement.attributes) continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (!ReactIconImports.#specifier.test(specifier) || !clause || clause.name) continue;
      if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) continue;
      const bindings = clause.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      if (bindings.elements.some((element) => element.propertyName && !ts.isIdentifier(element.propertyName))) continue;
      found.push({
        start: statement.getStart(sourceFile),
        end: statement.end,
        specifier,
        named: bindings.elements.map((element) => ({
          imported: (element.propertyName ?? element.name).text,
          local: element.name.text,
          isType: element.isTypeOnly,
        })),
      });
    }
    return found;
  }

  static #named(item: NamedItem): string {
    return item.imported === item.local ? item.imported : `${item.imported} as ${item.local}`;
  }

  static #keptImport(kept: NamedItem[], specifier: string): string {
    const typeOnly = kept.every((item) => item.isType);
    const names = kept.map((item) => `${item.isType && !typeOnly ? "type " : ""}${ReactIconImports.#named(item)}`);
    return `import ${typeOnly ? "type " : ""}{ ${names.join(", ")} } from ${JSON.stringify(specifier)};`;
  }

  #setFileOf(specifier: string, importer: string): string | null {
    const dir = path.dirname(importer);
    const key = `${dir}\0${specifier}`;
    if (!this.#setFiles.has(key)) {
      let file: string | null;
      try {
        file = path.join(fs.realpathSync(path.dirname(Bun.resolveSync(specifier, dir))), "index.mjs");
      } catch {
        file = null;
      }
      this.#setFiles.set(key, file);
    }
    return this.#setFiles.get(key) ?? null;
  }

  async #setOf(specifier: string, importer: string): Promise<IconSet | null> {
    const setFile = this.#setFileOf(specifier, importer);
    if (!setFile) return null;
    let set = this.#sets.get(setFile);
    if (!set) {
      set = this.#readSet(setFile);
      this.#sets.set(setFile, set);
    }
    return await set;
  }

  async #readSet(setFile: string): Promise<IconSet | null> {
    const file = Bun.file(setFile);
    if (!(await file.exists())) return null;
    const text = await file.text();
    const starts = [...text.matchAll(ReactIconImports.#iconStart)];
    const first = starts[0]?.index;
    if (first === undefined) return null;
    const preamble = text.slice(0, first).replace(ReactIconImports.#header, "");
    if (preamble.length === first || preamble.replace(/\/\/[^\n]*/g, "").trim()) return null;
    const spans = new Map<string, [number, number]>();
    starts.forEach((match, idx) => {
      if (match[1]) spans.set(match[1], [match.index, starts[idx + 1]?.index ?? text.length]);
    });
    const setDir = path.dirname(setFile);
    const lib = path.join(path.dirname(setDir), "lib", "index.mjs");
    if (!fs.existsSync(lib)) return null;
    const outDir = path.join(this.#outRoot, Bun.hash(path.dirname(setDir)).toString(36), path.basename(setDir));
    return { file: setFile, text, spans, outDir, lib: fs.realpathSync(lib) };
  }

  static #bodyOf(set: IconSet, name: string): string | null {
    const span = set.spans.get(name);
    const body = span ? set.text.slice(...span) : null;
    return body && ReactIconImports.#iconBody.test(body) ? body.trimEnd() : null;
  }

  async #fileOf(set: IconSet, key: string, names: string[]): Promise<string | null> {
    const unique = [...new Set(names)].sort();
    const file = path.join(set.outDir, `${Bun.hash(`${key}\0\0${unique.join(",")}`).toString(36)}.mjs`);
    let written = this.#files.get(file);
    if (!written) {
      const bodies = unique.map((name) => ReactIconImports.#bodyOf(set, name) ?? "");
      const contents = `import { GenIcon } from ${JSON.stringify(set.lib)};\n${bodies.join("\n")}\n`;
      written = ReactIconImports.#write(file, contents);
      this.#files.set(file, written);
      if (await written) this.#contents.set(file, contents);
    }
    return await written;
  }

  static async #write(file: string, contents: string): Promise<string | null> {
    try {
      const existing = Bun.file(file);
      if (!(await existing.exists()) || (await existing.text()) !== contents) await Bun.write(file, contents);
      return file;
    } catch {
      return null;
    }
  }
}

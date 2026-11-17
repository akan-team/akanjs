import fs from "node:fs";
import path from "node:path";
import type { BunPlugin } from "bun";
import ts from "typescript";
import type { App } from "../commandDecorators";
import type { NamedItem } from "./moduleSyntax";

type Pipe = (source: string, args: { path: string }) => string | Promise<string | null> | null;

interface IconSet {
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

//* A set module's one shared chunk carries every icon that any route sharing the chunk names; a module per icon does not.
export class ReactIconImports {
  static readonly #specifier = /^react-icons\/[\w-]+$/;
  //? The package generates every set as this one import followed by one `export function` per icon.
  static readonly #header = "import { GenIcon } from '../lib/index.mjs';";
  static readonly #iconStart = /^export function ([A-Za-z_$][\w$]*) \(props\) \{$/gm;
  static readonly #iconBody = /^export function [\w$]+ \(props\) \{\n {2}return GenIcon\(\{.*\}\)\(props\);\n\};\n*$/;
  readonly #outRoot: string;
  readonly #setFiles = new Map<string, string | null>();
  readonly #sets = new Map<string, Promise<IconSet | null>>();
  readonly #files = new Map<string, Promise<string | null>>();
  readonly #contents = new Map<string, string>();

  constructor(outRoot: string) {
    this.#outRoot = outRoot;
  }

  static forApp(app: App): ReactIconImports {
    return new ReactIconImports(path.join(app.cwdPath, ".akan", "generated", "react-icons"));
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
      const lines: string[] = [];
      for (const item of statement.named) {
        const file = item.isType ? null : await this.#fileOf(set, item.imported);
        if (file) lines.push(`import { ${ReactIconImports.#named(item)} } from ${JSON.stringify(file)};`);
        else kept.push(item);
      }
      if (lines.length === 0) continue;
      if (kept.length > 0) lines.unshift(ReactIconImports.#keptImport(kept, statement.specifier));
      const newlines = source.slice(statement.start, statement.end).split("\n").length - 1;
      out = `${out.slice(0, statement.start)}${lines.join(" ")}${"\n".repeat(newlines)}${out.slice(statement.end)}`;
    }
    return out === source ? null : out;
  }

  async fileOf(specifier: string, name: string, importer: string): Promise<string | null> {
    const set = await this.#setOf(specifier, importer);
    return set ? await this.#fileOf(set, name) : null;
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
    return { text, spans, outDir, lib: fs.realpathSync(lib) };
  }

  async #fileOf(set: IconSet, name: string): Promise<string | null> {
    const span = set.spans.get(name);
    if (!span) return null;
    //? Sets hold names that differ only in case (GiJetpack, GiJetPack), which share one file on a case-insensitive disk.
    const file = path.join(set.outDir, `${name}.${Bun.hash(name).toString(36)}.mjs`);
    let written = this.#files.get(file);
    if (!written) {
      const body = set.text.slice(...span);
      const contents = `import { GenIcon } from ${JSON.stringify(set.lib)};\n${body.trimEnd()}\n`;
      written = ReactIconImports.#iconBody.test(body) ? ReactIconImports.#write(file, contents) : Promise.resolve(null);
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

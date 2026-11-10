import path from "node:path";
import ts from "typescript";
import { ApiDeclarationPrinter } from "./apiDeclarationPrinter";
import { type ApiTarget, ApiTargets } from "./apiTargets";

export interface ApiEntry {
  subpath: string;
  specifier: string;
  file: string;
  reportName: string;
}

export interface ApiEntryPoints {
  packageName: string;
  entries: ApiEntry[];
  wildcards: string[];
}

interface ApiBlock {
  key: string;
  text: string;
}

type PackageExports = Record<string, string | Record<string, unknown>>;

export class ApiReport {
  static readonly extension = ".api.md";
  static readonly referencedHeading = "## Referenced, not exported";
  readonly #packageDir: string;
  readonly #program: ts.Program;
  readonly #targets: ApiTargets;
  #exported: Set<string> | null = null;

  static compare(a: string, b: string) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  static entriesOf(packageJson: { name: string; exports?: PackageExports }, packageDir: string): ApiEntryPoints {
    const entries: ApiEntry[] = [];
    const wildcards: string[] = [];
    for (const [subpath, value] of Object.entries(packageJson.exports ?? {})) {
      const target = typeof value === "string" ? value : (value.types ?? value.import ?? value.default);
      if (typeof target !== "string") continue;
      if (subpath.includes("*")) {
        wildcards.push(subpath);
        continue;
      }
      if (!/\.tsx?$/.test(target)) continue;
      const specifier = subpath === "." ? packageJson.name : `${packageJson.name}/${subpath.slice(2)}`;
      entries.push({
        subpath,
        specifier,
        file: path.resolve(packageDir, target),
        reportName: `${specifier.replace(/^@/, "").replaceAll("/", ".")}${ApiReport.extension}`,
      });
    }
    return { packageName: packageJson.name, entries, wildcards: wildcards.sort(ApiReport.compare) };
  }

  static async generate(packageDir: string, tsconfigPath = path.join(packageDir, "tsconfig.json")) {
    const packageJson = (await Bun.file(path.join(packageDir, "package.json")).json()) as {
      name: string;
      exports?: PackageExports;
    };
    const { packageName, entries, wildcards } = ApiReport.entriesOf(packageJson, packageDir);
    const report = new ApiReport(packageDir, entries, tsconfigPath);
    const files = new Map(entries.map((entry) => [entry.reportName, report.render(entry, entries)]));
    if (wildcards.length) files.set(`${packageName}.wildcards${ApiReport.extension}`, ApiReport.#wildcards(wildcards));
    return new Map([...files].sort(([a], [b]) => ApiReport.compare(a, b)));
  }

  constructor(packageDir: string, entries: ApiEntry[], tsconfigPath: string) {
    this.#packageDir = packageDir;
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath), {
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: true,
      noEmit: false,
      noEmitOnError: false,
      sourceMap: false,
      incremental: false,
      composite: false,
    });
    const rootNames = entries.map((entry) => entry.file);
    const reached = ts.createProgram({ rootNames, options: parsed.options });
    //? A workspace package the build embeds is reached through a node_modules link, so tsc treats it as external and
    //? emits nothing for it until it is named as a root.
    const embedded = reached
      .getSourceFiles()
      .filter((sourceFile) => !sourceFile.isDeclarationFile && reached.isSourceFileFromExternalLibrary(sourceFile))
      .map((sourceFile) => sourceFile.fileName);
    this.#program = embedded.length
      ? ts.createProgram({ rootNames: [...rootNames, ...embedded], options: parsed.options, oldProgram: reached })
      : reached;
    const emitted = new Map<string, string>();
    this.#program.emit(
      undefined,
      (_fileName, text, _bom, _onError, sourceFiles) => {
        const source = sourceFiles?.[0];
        if (source) emitted.set(source.fileName, text);
      },
      undefined,
      true,
    );
    this.#targets = new ApiTargets(this.#program, emitted);
  }

  render(entry: ApiEntry, entries: ApiEntry[] = [entry]) {
    const exported = this.#exportedBy(entries);
    const symbols = this.#exportsOfEntry(entry);
    const blocks = symbols
      .map((symbol) => ({ key: symbol.getName(), text: this.#exportBlockOf(symbol) }))
      .sort((a, b) => ApiReport.compare(a.key, b.key));
    const referenced = this.#referencedBlocks(
      this.#targets.expand(symbols.flatMap((symbol) => this.#targets.ofSymbol(symbol))),
      exported,
    );
    const text = [
      `# \`${entry.specifier}\``,
      "",
      "Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.",
      "",
      ...ApiReport.#fenced(blocks),
      ...(referenced.length
        ? [
            ApiReport.referencedHeading,
            "",
            "The declarations above name these, and no entry point exports them.",
            "",
            ...ApiReport.#fenced(referenced),
          ]
        : []),
    ].join("\n");
    if (text.includes('import("/'))
      throw new Error(`The API report of ${entry.specifier} names a module by an absolute path.`);
    return text;
  }

  #exportsOfEntry(entry: ApiEntry) {
    const sourceFile = this.#program.getSourceFile(entry.file);
    if (!sourceFile) throw new Error(`${entry.file} is not in the program built for the API report.`);
    return this.#targets.exportsOf(sourceFile);
  }

  #exportedBy(entries: ApiEntry[]) {
    if (this.#exported) return this.#exported;
    const targets = entries.flatMap((entry) =>
      this.#exportsOfEntry(entry).flatMap((symbol) => this.#targets.ofSymbol(symbol)),
    );
    this.#exported = new Set([...targets, ...this.#targets.expand(targets)].map((target) => target.id));
    return this.#exported;
  }

  #exportBlockOf(symbol: ts.Symbol): string {
    const name = symbol.getName();
    const texts = [...new Set(this.#targets.ofSymbol(symbol).flatMap((target) => this.#exportTextsOf(target, name)))];
    return texts.length ? texts.join("\n") : `export declare const ${name}: ${this.#targets.typeTextOf(symbol)};`;
  }

  #exportTextsOf(target: ApiTarget, name: string): string[] {
    if (target.thirdParty) {
      if (target.members) return [`export * as ${name} from "${target.thirdParty}";`];
      const binding = target.name === name ? name : `${target.name} as ${name}`;
      return [`export { ${binding} } from "${target.thirdParty}";`];
    }
    if (target.members) {
      const members = target.members
        .map((member) => ({ key: member.getName(), text: this.#exportBlockOf(member) }))
        .sort((a, b) => ApiReport.compare(a.key, b.key))
        .map(({ text }) => text.replace(/^export (?:declare )?(?![{*])/gm, "").replace(/^/gm, "    "));
      return [`export declare namespace ${name} {\n${members.join("\n")}\n}`];
    }
    const file = target.file;
    if (!file) return [];
    return target.statements.map((statement) =>
      ApiDeclarationPrinter.print(statement, file, { localName: target.name, name, mode: "export" }),
    );
  }

  #referencedBlocks(roots: ApiTarget[], exported: ReadonlySet<string>): ApiBlock[] {
    const found = new Map<string, ApiTarget>();
    const queue = [...roots];
    for (let target = queue.pop(); target; target = queue.pop()) {
      for (const reference of this.#targets.referencesOf(target)) {
        if (reference.thirdParty || exported.has(reference.id) || found.has(reference.id)) continue;
        found.set(reference.id, reference);
        queue.push(reference);
      }
    }
    const rendered = [...found.values()].flatMap((target) => {
      const file = target.file;
      if (!file || !target.statements.length) return [];
      const text = target.statements
        .map((statement) =>
          ApiDeclarationPrinter.print(statement, file, { localName: target.name, name: target.name, mode: "declare" }),
        )
        .join("\n");
      return [{ name: target.name, module: this.#modulePathOf(target.origin), text }];
    });
    const counts = new Map<string, number>();
    for (const { name } of rendered) counts.set(name, (counts.get(name) ?? 0) + 1);
    return rendered
      .map(({ name, module, text }) =>
        (counts.get(name) ?? 0) > 1 ? { key: `${name} ${module}`, text: `// ${module}\n${text}` } : { key: name, text },
      )
      .sort((a, b) => ApiReport.compare(a.key, b.key));
  }

  #modulePathOf(fileName: string) {
    return path
      .relative(this.#packageDir, fileName)
      .replaceAll("\\", "/")
      .replace(/(?:\.d)?\.tsx?$/, "");
  }

  static #fenced(blocks: ApiBlock[]) {
    return ["```ts", blocks.map((block) => block.text).join("\n\n"), "```", ""];
  }

  static #wildcards(wildcards: string[]) {
    return [
      "# Wildcard subpaths",
      "",
      "Each of these makes every file under it importable. Their files are not reported one by one.",
      "",
      ...wildcards.map((wildcard) => `- \`${wildcard}\``),
      "",
    ].join("\n");
  }
}

import path from "node:path";
import type { PageEntry } from "../artifact/implicitRootLayout";
import { AsyncDefaultExportDetector } from "../transforms/asyncDefaultExportDetector";

export interface PagesEntrySourceOptions {
  /** Detects an async default export; a caller that outlives one generation keeps its own cache across saves. */
  isAsyncDefault?: (moduleAbsPath: string) => Promise<boolean>;
}

export class PagesEntrySourceGenerator {
  #pageEntries: PageEntry[];
  readonly #asyncDefaults = new Map<string, Promise<boolean>>();
  readonly #detect: (moduleAbsPath: string) => Promise<boolean>;

  constructor(pageEntries: PageEntry[], { isAsyncDefault }: PagesEntrySourceOptions = {}) {
    this.#pageEntries = pageEntries;
    this.#detect = isAsyncDefault ?? ((moduleAbsPath) => AsyncDefaultExportDetector.detect(moduleAbsPath));
  }

  static generate(pageEntries: PageEntry[]): string {
    return new PagesEntrySourceGenerator(pageEntries).generate();
  }

  generate(): string {
    const lines = this.#pageEntries.map(({ key, moduleAbsPath }) => {
      const specifier = PagesEntrySourceGenerator.#toImportSpecifier(moduleAbsPath);
      return `  ${JSON.stringify(key)}: () => import(${JSON.stringify(specifier)}),`;
    });
    return `export const pages = {\n${lines.join("\n")}\n};\n`;
  }

  static async generateStatic(pageEntries: PageEntry[], { fromDir }: { fromDir?: string } = {}): Promise<string> {
    return await new PagesEntrySourceGenerator(pageEntries).generateStatic({ fromDir });
  }

  // `fromDir` makes the specifiers relative: Bun inlines an absolute import of a file that is also an entrypoint.
  async generateStatic({ fromDir }: { fromDir?: string } = {}): Promise<string> {
    const imports = this.#pageEntries.map(({ moduleAbsPath }, index) => {
      const specifier = fromDir
        ? PagesEntrySourceGenerator.#toRelativeSpecifier(fromDir, moduleAbsPath)
        : PagesEntrySourceGenerator.#toImportSpecifier(moduleAbsPath);
      return `import * as page${index} from ${JSON.stringify(specifier)};`;
    });
    const entries = await Promise.all(
      this.#pageEntries.map(async ({ key, moduleAbsPath }, index) => {
        const isAsyncDefault = await this.#isAsyncDefault(moduleAbsPath);
        return `  ${JSON.stringify(key)}: { loader: async () => page${index}, isAsyncDefault: ${isAsyncDefault} },`;
      }),
    );
    return `${imports.join("\n")}\nexport const pages = {\n${entries.join("\n")}\n};\n`;
  }

  // Route HMR in the dev registry bundle: `akanWebkit` is the entry's namespace import of `akanjs/webkit`.
  async generateHotReplace({
    fromDir,
    ownerId,
    moduleIds,
  }: {
    fromDir: string;
    ownerId: string;
    moduleIds: string[];
  }): Promise<string> {
    const entries = await Promise.all(
      this.#pageEntries.map(async ({ key, moduleAbsPath }) => {
        const specifier = PagesEntrySourceGenerator.#toRelativeSpecifier(fromDir, moduleAbsPath);
        const isAsyncDefault = await this.#isAsyncDefault(moduleAbsPath);
        return `    ${JSON.stringify(key)}: { loader: async () => require(${JSON.stringify(specifier)}), isAsyncDefault: ${isAsyncDefault} },`;
      }),
    );
    return `__akan.accept(${JSON.stringify(ownerId)}, ${JSON.stringify(moduleIds)}, async () => {
  const replaced = await akanWebkit.replacePages({
${entries.join("\n")}
  });
  if (!replaced) throw new Error("the route table no longer matches the pages it was built from");
});
`;
  }

  #isAsyncDefault(moduleAbsPath: string): Promise<boolean> {
    const known = this.#asyncDefaults.get(moduleAbsPath);
    if (known) return known;
    const detected = this.#detect(moduleAbsPath);
    this.#asyncDefaults.set(moduleAbsPath, detected);
    return detected;
  }

  static #toImportSpecifier(moduleAbsPath: string): string {
    return path.resolve(moduleAbsPath).split(path.sep).join("/");
  }

  static #toRelativeSpecifier(fromDir: string, moduleAbsPath: string): string {
    const relative = path.relative(fromDir, path.resolve(moduleAbsPath)).split(path.sep).join("/");
    return relative.startsWith(".") ? relative : `./${relative}`;
  }
}

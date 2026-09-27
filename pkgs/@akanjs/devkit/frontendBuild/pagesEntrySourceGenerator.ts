import path from "node:path";
import type { PageEntry } from "../artifact/implicitRootLayout";
import { AsyncDefaultExportDetector } from "../transforms/asyncDefaultExportDetector";

export class PagesEntrySourceGenerator {
  #pageEntries: PageEntry[];

  constructor(pageEntries: PageEntry[]) {
    this.#pageEntries = pageEntries;
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
        const isAsyncDefault = await AsyncDefaultExportDetector.detect(moduleAbsPath);
        return `  ${JSON.stringify(key)}: { loader: async () => page${index}, isAsyncDefault: ${isAsyncDefault} },`;
      }),
    );
    return `${imports.join("\n")}\nexport const pages = {\n${entries.join("\n")}\n};\n`;
  }

  static #toImportSpecifier(moduleAbsPath: string): string {
    return path.resolve(moduleAbsPath).split(path.sep).join("/");
  }

  static #toRelativeSpecifier(fromDir: string, moduleAbsPath: string): string {
    const relative = path.relative(fromDir, path.resolve(moduleAbsPath)).split(path.sep).join("/");
    return relative.startsWith(".") ? relative : `./${relative}`;
  }
}

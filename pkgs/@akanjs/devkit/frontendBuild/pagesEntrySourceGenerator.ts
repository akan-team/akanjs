import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { PageEntry } from "../artifact/implicitRootLayout";

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

  static generateStatic(pageEntries: PageEntry[]): string {
    return new PagesEntrySourceGenerator(pageEntries).generateStatic();
  }

  generateStatic(): string {
    const imports = this.#pageEntries.map(({ moduleAbsPath }, index) => {
      const specifier = PagesEntrySourceGenerator.#toImportSpecifier(moduleAbsPath);
      return `import * as page${index} from ${JSON.stringify(specifier)};`;
    });
    const entries = this.#pageEntries.map(({ key, moduleAbsPath }, index) => {
      const isAsyncDefault = PagesEntrySourceGenerator.#hasAsyncDefaultExport(moduleAbsPath);
      return `  ${JSON.stringify(key)}: { loader: async () => page${index}, isAsyncDefault: ${isAsyncDefault} },`;
    });
    return `${imports.join("\n")}\nexport const pages = {\n${entries.join("\n")}\n};\n`;
  }
  static #toImportSpecifier(moduleAbsPath: string): string {
    return path.resolve(moduleAbsPath).split(path.sep).join("/");
  }

  static #hasAsyncDefaultExport(moduleAbsPath: string): boolean {
    try {
      const source = fs.readFileSync(path.resolve(moduleAbsPath), "utf8");
      const sourceFile = ts.createSourceFile(
        moduleAbsPath,
        source,
        ts.ScriptTarget.Latest,
        true,
        PagesEntrySourceGenerator.#scriptKind(moduleAbsPath),
      );
      return PagesEntrySourceGenerator.#sourceFileHasAsyncDefaultExport(sourceFile);
    } catch {
      return false;
    }
  }

  static #sourceFileHasAsyncDefaultExport(sourceFile: ts.SourceFile): boolean {
    const asyncBindings = new Map<string, boolean>();
    let defaultIdentifier: string | null = null;

    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement)) {
        if (PagesEntrySourceGenerator.#hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
          return PagesEntrySourceGenerator.#hasModifier(statement, ts.SyntaxKind.AsyncKeyword);
        }
        if (statement.name) {
          asyncBindings.set(
            statement.name.text,
            PagesEntrySourceGenerator.#hasModifier(statement, ts.SyntaxKind.AsyncKeyword),
          );
        }
        continue;
      }

      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          asyncBindings.set(
            declaration.name.text,
            PagesEntrySourceGenerator.#isAsyncFunctionExpression(declaration.initializer),
          );
        }
        continue;
      }

      if (ts.isExportAssignment(statement)) {
        if (PagesEntrySourceGenerator.#isAsyncFunctionExpression(statement.expression)) return true;
        if (ts.isIdentifier(statement.expression)) defaultIdentifier = statement.expression.text;
        continue;
      }

      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const exportClause = statement.exportClause;
        for (const specifier of exportClause.elements) {
          if (specifier.name.text !== "default") continue;
          defaultIdentifier = specifier.propertyName?.text ?? specifier.name.text;
        }
      }
    }

    return defaultIdentifier ? asyncBindings.get(defaultIdentifier) === true : false;
  }

  static #hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
  }

  static #isAsyncFunctionExpression(node?: ts.Expression): boolean {
    return Boolean(
      node &&
        (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
        PagesEntrySourceGenerator.#hasModifier(node, ts.SyntaxKind.AsyncKeyword),
    );
  }

  static #scriptKind(moduleAbsPath: string): ts.ScriptKind {
    return moduleAbsPath.endsWith(".tsx") || moduleAbsPath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  }
}

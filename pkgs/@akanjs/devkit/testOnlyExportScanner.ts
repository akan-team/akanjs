import ts from "typescript";
import type { QualityWarning, SourceFileInfo } from "./qualityScanner";

interface ExportedDeclaration {
  name: string;
  line: number;
  statement: ts.Statement;
}

interface TestReference {
  file: string;
  line: number;
}

export class TestOnlyExportScanner {
  static readonly rule = "akan.global.test-only-export";
  static #facets = new Set(["common", "webkit", "srvkit", "ui"]);

  scan(sourceFiles: SourceFileInfo[]): QualityWarning[] {
    const liveFileNumByName = new Map<string, number>();
    const testRefsByName = new Map<string, TestReference[]>();
    for (const { file, sourceFile } of sourceFiles) {
      const isTest = TestOnlyExportScanner.#isTest(file);
      for (const [name, line] of TestOnlyExportScanner.#identifierLinesOf(sourceFile)) {
        if (!isTest) liveFileNumByName.set(name, (liveFileNumByName.get(name) ?? 0) + 1);
        else if (testRefsByName.has(name)) testRefsByName.get(name)?.push({ file, line });
        else testRefsByName.set(name, [{ file, line }]);
      }
    }
    return sourceFiles
      .filter(({ file }) => TestOnlyExportScanner.#isFacetSource(file))
      .flatMap(({ file, sourceFile }) => {
        const declarations = TestOnlyExportScanner.#exportedDeclarationsOf(sourceFile);
        return declarations
          .filter(({ name }) => (liveFileNumByName.get(name) ?? 0) <= 1)
          .filter(({ name }) => !TestOnlyExportScanner.#isUsedInFile(sourceFile, name, declarations))
          .flatMap(({ name, line }) => {
            const testRefs = testRefsByName.get(name);
            if (!testRefs?.length) return [];
            return [
              {
                rule: TestOnlyExportScanner.rule,
                scope: "global" as const,
                severity: "warning" as const,
                file,
                line,
                message: `Exported "${name}" is referenced only by tests: ${testRefs.map((ref) => ref.file).join(", ")}.`,
                locations: testRefs,
              },
            ];
          });
      });
  }

  static #isTest(file: string) {
    return /\.(test|spec)\.tsx?$/.test(file);
  }

  //? A lib's facets are public API for every workspace that installs it, so an export no app here calls is not dead.
  static #isFacetSource(file: string) {
    const segments = file.split("/");
    if (segments[0] !== "apps") return false;
    return TestOnlyExportScanner.#facets.has(segments[2] ?? "") && !TestOnlyExportScanner.#isTest(file);
  }

  static #identifierLinesOf(sourceFile: ts.SourceFile) {
    const lines = new Map<string, number>();
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && !lines.has(node.text))
        lines.set(node.text, sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return lines;
  }

  static #exportedDeclarationsOf(sourceFile: ts.SourceFile): ExportedDeclaration[] {
    return sourceFile.statements.flatMap((statement) => {
      if (!TestOnlyExportScanner.#isNamedExport(statement)) return [];
      return TestOnlyExportScanner.#declaredNamesOf(statement).map((identifier) => ({
        name: identifier.text,
        line: sourceFile.getLineAndCharacterOfPosition(identifier.getStart(sourceFile)).line + 1,
        statement,
      }));
    });
  }

  static #isNamedExport(statement: ts.Statement) {
    if (!ts.canHaveModifiers(statement)) return false;
    const modifiers = ts.getModifiers(statement) ?? [];
    return (
      modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
      !modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    );
  }

  static #declaredNamesOf(statement: ts.Statement): ts.Identifier[] {
    if (ts.isVariableStatement(statement))
      return statement.declarationList.declarations
        .map((declaration) => declaration.name)
        .filter((name): name is ts.Identifier => ts.isIdentifier(name));
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    )
      return statement.name ? [statement.name] : [];
    return [];
  }

  static #isUsedInFile(sourceFile: ts.SourceFile, name: string, declarations: ExportedDeclaration[]) {
    const ownStatements = new Set(declarations.filter((entry) => entry.name === name).map((entry) => entry.statement));
    let used = false;
    const visit = (node: ts.Node) => {
      if (used || ownStatements.has(node as ts.Statement)) return;
      if (ts.isIdentifier(node) && node.text === name) used = true;
      else ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return used;
  }
}

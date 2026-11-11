import ts from "typescript";

export class BareErrorScanner {
  static readonly #builtins: ReadonlySet<string> = new Set([
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "ReferenceError",
    "EvalError",
    "URIError",
    "AggregateError",
  ]);
  static readonly #globals: ReadonlySet<string> = new Set(["globalThis", "window", "self"]);
  //? Without the lib and imports, a name the binder resolves is one this file declares, and an unresolved one is global.
  static readonly #options: ts.CompilerOptions = { noLib: true, noResolve: true, noEmit: true, types: [] };

  lines(sourceFile: ts.SourceFile): number[] {
    const declared = BareErrorScanner.#declaredNamesOf(sourceFile);
    const shadows = [...BareErrorScanner.#builtins, ...BareErrorScanner.#globals].some((name) => declared.has(name));
    if (!shadows) return BareErrorScanner.#scan(sourceFile, () => true);
    const rootName = sourceFile.fileName.endsWith(".tsx") ? "/scan.tsx" : "/scan.ts";
    const scope = ts.createSourceFile(
      rootName,
      sourceFile.text,
      ts.ScriptTarget.Latest,
      true,
      rootName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const checker = ts
      .createProgram({
        rootNames: [rootName],
        options: BareErrorScanner.#options,
        host: BareErrorScanner.#hostOf(scope),
      })
      .getTypeChecker();
    return BareErrorScanner.#scan(
      scope,
      (identifier) =>
        !checker
          .getSymbolAtLocation(identifier)
          ?.declarations?.some((declaration) => declaration.getSourceFile() === scope),
    );
  }

  static #scan(sourceFile: ts.SourceFile, isGlobal: (identifier: ts.Identifier) => boolean) {
    const lines: number[] = [];
    const visit = (node: ts.Node) => {
      const constructed = ts.isNewExpression(node) || ts.isCallExpression(node) ? node.expression : null;
      const extended =
        ts.isClassDeclaration(node) || ts.isClassExpression(node)
          ? node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression
          : null;
      const target = constructed ?? extended;
      if (target && BareErrorScanner.#namesBuiltin(target, isGlobal))
        lines.push(sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1);
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    return lines;
  }

  static #declaredNamesOf(sourceFile: ts.SourceFile) {
    const names = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && BareErrorScanner.#declares(node.parent, node)) names.add(node.text);
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    return names;
  }

  static #declares(parent: ts.Node, identifier: ts.Identifier) {
    return (
      (ts.isVariableDeclaration(parent) ||
        ts.isParameter(parent) ||
        ts.isBindingElement(parent) ||
        ts.isFunctionDeclaration(parent) ||
        ts.isFunctionExpression(parent) ||
        ts.isClassDeclaration(parent) ||
        ts.isClassExpression(parent) ||
        ts.isImportSpecifier(parent) ||
        ts.isImportClause(parent) ||
        ts.isNamespaceImport(parent) ||
        ts.isImportEqualsDeclaration(parent) ||
        ts.isEnumDeclaration(parent) ||
        ts.isModuleDeclaration(parent)) &&
      parent.name === identifier
    );
  }

  static #namesBuiltin(expression: ts.Expression, isGlobal: (identifier: ts.Identifier) => boolean) {
    const callee = BareErrorScanner.#unwrapped(expression);
    if (ts.isIdentifier(callee)) return BareErrorScanner.#builtins.has(callee.text) && isGlobal(callee);
    if (!ts.isPropertyAccessExpression(callee) || !BareErrorScanner.#builtins.has(callee.name.text)) return false;
    const owner = BareErrorScanner.#unwrapped(callee.expression);
    return ts.isIdentifier(owner) && BareErrorScanner.#globals.has(owner.text) && isGlobal(owner);
  }

  static #unwrapped(expression: ts.Expression) {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current)
    )
      current = current.expression;
    return current;
  }

  static #hostOf(scope: ts.SourceFile): ts.CompilerHost {
    return {
      getSourceFile: (fileName) => (fileName === scope.fileName ? scope : undefined),
      writeFile: () => undefined,
      getDefaultLibFileName: () => "/lib.d.ts",
      useCaseSensitiveFileNames: () => true,
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => "/",
      getNewLine: () => "\n",
      fileExists: (fileName) => fileName === scope.fileName,
      readFile: () => undefined,
    };
  }
}

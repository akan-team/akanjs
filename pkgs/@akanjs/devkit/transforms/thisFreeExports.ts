import ts from "typescript";
import { ObjectModule } from "./objectModule";

const OWN_THIS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

//* The exports a caller may call without the object it reached them through: an arrow function, or a function whose
//* parameters and body read no `this` outside a nested function that binds its own. Any other export (a call's result,
//* a re-export, a class, a `let`) may read `this`, so it is never one of them.
export class ThisFreeExports {
  static read(source: string, file: string): Set<string> {
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      false,
      ObjectModule.scriptKindOf(file),
    );
    const free = new Map<string, boolean>();
    const exported = new Map<string, string>();
    const names = new Set<string>();
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.body) {
        const name = statement.name?.text ?? "default";
        free.set(name, !ThisFreeExports.#readsThis(statement));
        if (ThisFreeExports.#hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) exported.set("default", name);
        else if (ThisFreeExports.#hasModifier(statement, ts.SyntaxKind.ExportKeyword)) exported.set(name, name);
      } else if (ts.isVariableStatement(statement)) {
        const constant = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
        const isExported = ThisFreeExports.#hasModifier(statement, ts.SyntaxKind.ExportKeyword);
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          const name = declaration.name.text;
          free.set(name, constant && !!declaration.initializer && ThisFreeExports.#isFree(declaration.initializer));
          if (isExported) exported.set(name, name);
        }
      } else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause) {
        if (!ts.isNamedExports(statement.exportClause)) continue;
        for (const element of statement.exportClause.elements)
          exported.set(element.name.text, (element.propertyName ?? element.name).text);
      } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
        const value = ThisFreeExports.#unwrap(statement.expression);
        if (ts.isIdentifier(value)) exported.set("default", value.text);
        else if (ThisFreeExports.#isFree(value)) names.add("default");
      }
    }
    for (const [name, local] of exported) if (free.get(local)) names.add(name);
    return names;
  }

  static #isFree(node: ts.Expression) {
    const value = ThisFreeExports.#unwrap(node);
    if (ts.isArrowFunction(value)) return true;
    return ts.isFunctionExpression(value) && !ThisFreeExports.#readsThis(value);
  }

  static #readsThis(fn: ts.FunctionLikeDeclaration) {
    const visit = (node: ts.Node): boolean => {
      if (node.kind === ts.SyntaxKind.ThisKeyword) return true;
      if (OWN_THIS.has(node.kind)) return false;
      return ts.forEachChild(node, visit) ?? false;
    };
    return [...fn.parameters, ...(fn.body ? [fn.body] : [])].some(visit);
  }

  static #unwrap(node: ts.Expression): ts.Expression {
    let current = node;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current)
    )
      current = current.expression;
    return current;
  }

  static #hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
    return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);
  }
}

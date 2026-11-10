import ts from "typescript";

export interface FunctionSize {
  name: string;
  line: number;
  lineCount: number;
}

export interface ClassSize {
  name: string;
  line: number;
  memberCount: number;
}

type FunctionNode =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

export class StructureScanner {
  measure(sourceFile: ts.SourceFile): { functions: FunctionSize[]; classes: ClassSize[] } {
    const functions: FunctionSize[] = [];
    const classes: ClassSize[] = [];
    const lineOf = (pos: number) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
    const visit = (node: ts.Node, owners: string[]) => {
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        const name = StructureScanner.#classNameOf(node);
        classes.push({
          name: [...owners, name].join("."),
          line: lineOf(node.getStart(sourceFile)),
          memberCount: StructureScanner.#memberCountOf(node),
        });
        ts.forEachChild(node, (child) => visit(child, [...owners, name]));
        return;
      }
      if (StructureScanner.#isFunction(node)) {
        const name = StructureScanner.#functionNameOf(node);
        const line = lineOf(node.getStart(sourceFile));
        functions.push({
          name: [...owners, name].join("."),
          line,
          lineCount: lineOf(node.getEnd()) - line + 1,
        });
        ts.forEachChild(node, (child) => visit(child, [...owners, name]));
        return;
      }
      if (ts.isObjectLiteralExpression(node)) {
        const name = StructureScanner.#boundNameOf(node);
        ts.forEachChild(node, (child) => visit(child, name === "<anonymous>" ? owners : [...owners, name]));
        return;
      }
      ts.forEachChild(node, (child) => visit(child, owners));
    };
    ts.forEachChild(sourceFile, (child) => visit(child, []));
    return { functions, classes };
  }

  static #memberCountOf(node: ts.ClassDeclaration | ts.ClassExpression) {
    const methods = new Set<string>();
    return node.members.filter((member) => {
      if (
        ts.isSemicolonClassElement(member) ||
        ts.isIndexSignatureDeclaration(member) ||
        ts.isClassStaticBlockDeclaration(member)
      )
        return false;
      if (!ts.isMethodDeclaration(member) && !ts.isConstructorDeclaration(member)) return true;
      const isStatic = ts.getModifiers(member)?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword);
      const key = `${isStatic ? "static " : ""}${ts.isConstructorDeclaration(member) ? "constructor" : StructureScanner.#textOf(member.name)}`;
      if (methods.has(key)) return false;
      methods.add(key);
      return true;
    }).length;
  }

  static #isFunction(node: ts.Node): node is FunctionNode {
    return (
      (ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)) &&
      node.body !== undefined
    );
  }

  static #functionNameOf(node: FunctionNode) {
    if (ts.isConstructorDeclaration(node)) return "constructor";
    if (ts.isGetAccessorDeclaration(node)) return `get ${StructureScanner.#textOf(node.name)}`;
    if (ts.isSetAccessorDeclaration(node)) return `set ${StructureScanner.#textOf(node.name)}`;
    if (node.name) return StructureScanner.#textOf(node.name);
    return ts.isFunctionDeclaration(node) ? "default" : StructureScanner.#boundNameOf(node);
  }

  static #classNameOf(node: ts.ClassDeclaration | ts.ClassExpression) {
    if (node.name) return node.name.text;
    return ts.isClassDeclaration(node) ? "default" : StructureScanner.#boundNameOf(node);
  }

  static #boundNameOf(node: ts.Node) {
    let current: ts.Node = StructureScanner.#outerOf(node);
    let call: string | null = null;
    while (ts.isCallExpression(current.parent) || ts.isNewExpression(current.parent)) {
      const callee = current.parent.expression;
      if (current === callee) break;
      call ??= `${ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : "call"}()`;
      current = StructureScanner.#outerOf(current.parent);
    }
    const { parent } = current;
    if (
      (ts.isVariableDeclaration(parent) ||
        ts.isPropertyAssignment(parent) ||
        ts.isPropertyDeclaration(parent) ||
        ts.isParameter(parent) ||
        ts.isBindingElement(parent)) &&
      parent.name &&
      !ts.isObjectBindingPattern(parent.name) &&
      !ts.isArrayBindingPattern(parent.name)
    )
      return StructureScanner.#textOf(parent.name);
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken)
      return ts.isPropertyAccessExpression(parent.left)
        ? parent.left.name.text
        : ts.isIdentifier(parent.left)
          ? parent.left.text
          : "assigned";
    if (ts.isExportAssignment(parent)) return "default";
    if (ts.isJsxExpression(parent))
      return ts.isJsxAttribute(parent.parent)
        ? ts.isIdentifier(parent.parent.name)
          ? parent.parent.name.text
          : parent.parent.name.getText()
        : "children";
    return call ?? "<anonymous>";
  }

  static #outerOf(node: ts.Node) {
    let current = node;
    while (
      ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isTypeAssertionExpression(current.parent) ||
      (ts.isPropertyAccessExpression(current.parent) && current.parent.expression === current) ||
      (ts.isCallExpression(current.parent) && current.parent.expression === current)
    )
      current = current.parent;
    return current;
  }

  static #textOf(name: ts.PropertyName | ts.BindingName) {
    if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name)) return name.text;
    if (ts.isNumericLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
    if (ts.isComputedPropertyName(name)) return `[${name.expression.getText()}]`;
    return "<pattern>";
  }
}

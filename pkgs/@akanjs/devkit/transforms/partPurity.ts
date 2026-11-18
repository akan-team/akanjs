import ts from "typescript";

const REACT_WRAPPERS = new Set(["memo", "forwardRef", "lazy", "createContext"]);
const FRESH_COLLECTIONS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);

//* Whether evaluating an expression only builds a value: a module holding nothing else can load later than its
//* neighbours, or not at all, and no other module can tell. A call is unknown unless React's own wrappers make it.
export class PartPurity {
  readonly #reactNames = new Set<string>();
  readonly #reactObjects = new Set<string>();

  note(statement: ts.ImportDeclaration) {
    const clause = statement.importClause;
    if (!clause || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "react") return;
    if (clause.name) this.#reactObjects.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (!bindings) return;
    if (ts.isNamespaceImport(bindings)) this.#reactObjects.add(bindings.name.text);
    else
      for (const element of bindings.elements)
        if (REACT_WRAPPERS.has((element.propertyName ?? element.name).text)) this.#reactNames.add(element.name.text);
  }

  of(node: ts.Expression): boolean {
    if (ts.isLiteralExpression(node) || ts.isIdentifier(node)) return true;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;
    switch (node.kind) {
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
      case ts.SyntaxKind.NullKeyword:
        return true;
    }
    if (ts.isClassExpression(node)) return this.ofClass(node);
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isTypeOfExpression(node) ||
      ts.isVoidExpression(node) ||
      ts.isPropertyAccessExpression(node)
    )
      return this.of(node.expression);
    if (ts.isElementAccessExpression(node)) return this.of(node.expression) && this.of(node.argumentExpression);
    if (ts.isTemplateExpression(node)) return node.templateSpans.every((span) => this.of(span.expression));
    if (ts.isPrefixUnaryExpression(node))
      return (
        node.operator !== ts.SyntaxKind.PlusPlusToken &&
        node.operator !== ts.SyntaxKind.MinusMinusToken &&
        this.of(node.operand)
      );
    if (ts.isBinaryExpression(node))
      return !PartPurity.#assigns(node.operatorToken.kind) && this.of(node.left) && this.of(node.right);
    if (ts.isConditionalExpression(node))
      return this.of(node.condition) && this.of(node.whenTrue) && this.of(node.whenFalse);
    if (ts.isArrayLiteralExpression(node))
      return node.elements.every(
        (element) =>
          ts.isOmittedExpression(element) || this.of(ts.isSpreadElement(element) ? element.expression : element),
      );
    if (ts.isObjectLiteralExpression(node)) return node.properties.every((property) => this.#ofProperty(property));
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return this.#ofJsx(node);
    if (ts.isCallExpression(node))
      return this.#wraps(node.expression) && node.arguments.every((argument) => this.of(argument));
    if (ts.isNewExpression(node))
      return (
        ts.isIdentifier(node.expression) &&
        FRESH_COLLECTIONS.has(node.expression.text) &&
        (node.arguments ?? []).every((argument) => this.of(argument))
      );
    return false;
  }

  ofClass(node: ts.ClassLikeDeclaration): boolean {
    if (ts.canHaveDecorators(node) && ts.getDecorators(node)?.length) return false;
    for (const clause of node.heritageClauses ?? [])
      if (clause.token === ts.SyntaxKind.ExtendsKeyword && !clause.types.every((type) => this.of(type.expression)))
        return false;
    return node.members.every((member) => {
      if (ts.isClassStaticBlockDeclaration(member)) return false;
      if (ts.canHaveDecorators(member) && ts.getDecorators(member)?.length) return false;
      if (member.name && ts.isComputedPropertyName(member.name) && !this.of(member.name.expression)) return false;
      if (!ts.isPropertyDeclaration(member) || !member.initializer) return true;
      const isStatic = (ts.getModifiers(member) ?? []).some(({ kind }) => kind === ts.SyntaxKind.StaticKeyword);
      return !isStatic || this.of(member.initializer);
    });
  }

  #ofProperty(property: ts.ObjectLiteralElementLike): boolean {
    if (property.name && ts.isComputedPropertyName(property.name) && !this.of(property.name.expression)) return false;
    if (ts.isPropertyAssignment(property)) return this.of(property.initializer);
    if (ts.isSpreadAssignment(property)) return this.of(property.expression);
    return true;
  }

  #ofJsx(node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment): boolean {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    const attributes = opening?.attributes.properties ?? [];
    const ofValue = (value: ts.JsxAttributeValue | ts.JsxChild | undefined): boolean => {
      if (!value || ts.isStringLiteral(value) || ts.isJsxText(value)) return true;
      if (ts.isJsxExpression(value)) return !value.expression || this.of(value.expression);
      return this.#ofJsx(value);
    };
    const held = attributes.every((attribute) =>
      ts.isJsxSpreadAttribute(attribute) ? this.of(attribute.expression) : ofValue(attribute.initializer),
    );
    return held && (ts.isJsxSelfClosingElement(node) || node.children.every(ofValue));
  }

  #wraps(callee: ts.Expression): boolean {
    if (ts.isIdentifier(callee)) return this.#reactNames.has(callee.text);
    return (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      this.#reactObjects.has(callee.expression.text) &&
      REACT_WRAPPERS.has(callee.name.text)
    );
  }

  static #assigns(kind: ts.SyntaxKind): boolean {
    return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
  }
}

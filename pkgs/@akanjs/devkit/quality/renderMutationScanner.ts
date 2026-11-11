import ts from "typescript";
import type { QualityWarning, SourceFileInfo } from "./qualityScanner";
import type { SignalMutationIndex } from "./signalMutationIndex";

//? A server render sends the visitor's credential with no Origin, so its writes run for whoever opens a link.
export class RenderMutationScanner {
  static readonly rule = "akan.ssr.render-mutation";
  static readonly fix =
    "Send the write from an explicit user action, such as a button that calls a store action. Only a write that is harmless to repeat and safe for anyone to trigger may stay in the render, with `{ duringRender: true }` as the call's option.";
  static #builders = new Set(["page", "layout", "rootLayout"]);
  static #stages = new Set(["render", "guard", "head", "loading", "notFound", "error"]);
  readonly #mutations: SignalMutationIndex;

  constructor(mutations: SignalMutationIndex) {
    this.#mutations = mutations;
  }

  scan(sourceFiles: SourceFileInfo[]): QualityWarning[] {
    return sourceFiles
      .filter(({ file }) => /^(apps|libs)\/[^/]+\/page\/.+(?<!\.test|\.spec)\.tsx$/.test(file))
      .flatMap((sourceFile) => this.#scanRoute(sourceFile));
  }

  #scanRoute({ file, sourceFile }: SourceFileInfo): QualityWarning[] {
    const fetchNames = RenderMutationScanner.#fetchBindingsOf(sourceFile);
    if (!fetchNames.size) return [];
    const functions = RenderMutationScanner.#functionsOf(sourceFile);
    const calls = new Set<ts.CallExpression>();
    const helpers = new Set<ts.Node>();
    const visit = (node: ts.Node, follow: boolean) => {
      if (RenderMutationScanner.#isEventHandler(node)) return;
      if (this.#isRenderMutation(file, node, fetchNames)) calls.add(node);
      const helper = follow ? RenderMutationScanner.#helperOf(node, functions) : undefined;
      if (helper) helpers.add(helper);
      ts.forEachChild(node, (child) => visit(child, follow));
    };
    for (const body of RenderMutationScanner.#renderBodiesOf(sourceFile, functions)) visit(body, true);
    for (const helper of helpers) visit(helper, false);
    return [...calls]
      .sort((a, b) => a.getStart(sourceFile) - b.getStart(sourceFile))
      .map((call) => ({
        rule: RenderMutationScanner.rule,
        scope: "ssr",
        severity: "warning",
        file,
        line: sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile)).line + 1,
        message: `${call.expression.getText(sourceFile)}() is a mutation sent while the route renders: anyone who opens a link to this page would perform it, and the call is refused unless it passes { duringRender: true }.`,
        fix: RenderMutationScanner.fix,
      }));
  }

  #isRenderMutation(file: string, node: ts.Node, fetchNames: Set<string>): node is ts.CallExpression {
    if (!ts.isCallExpression(node)) return false;
    const name = RenderMutationScanner.#endpointOf(node.expression, fetchNames);
    if (!name || !this.#mutations.isMutation(file, name)) return false;
    return !RenderMutationScanner.#optsIn(node, this.#mutations.policyIndexOf(file, name));
  }

  static #isEventHandler(node: ts.Node) {
    return ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && /^on[A-Z]/.test(node.name.text);
  }

  static #endpointOf(callee: ts.Expression, fetchNames: Set<string>) {
    if (ts.isPropertyAccessExpression(callee))
      return RenderMutationScanner.#isFetch(callee.expression, fetchNames) ? callee.name.text : null;
    if (ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression))
      return RenderMutationScanner.#isFetch(callee.expression, fetchNames) ? callee.argumentExpression.text : null;
    return null;
  }

  static #isFetch(expression: ts.Expression, fetchNames: Set<string>) {
    return ts.isIdentifier(expression) && fetchNames.has(expression.text);
  }

  //? The runtime reads only the policy slot, and a value there this cannot evaluate (a variable, a call) may opt in.
  static #optsIn(call: ts.CallExpression, policyIndex: number | null) {
    if (policyIndex === null) return false;
    const leading = call.arguments.slice(0, policyIndex + 1);
    if (leading.some((argument) => ts.isSpreadElement(argument))) return true;
    const policy = leading[policyIndex];
    return policy ? RenderMutationScanner.#policyOptsIn(policy) : false;
  }

  static #policyOptsIn(argument: ts.Expression): boolean {
    const policy = RenderMutationScanner.#unwrap(argument);
    if (!ts.isObjectLiteralExpression(policy)) return !RenderMutationScanner.#cannotBePolicy(policy);
    return policy.properties.some((property) => {
      if (ts.isSpreadAssignment(property)) return true;
      if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return false;
      if (!(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) return false;
      if (property.name.text !== "duringRender") return false;
      if (ts.isShorthandPropertyAssignment(property)) return true;
      const value = RenderMutationScanner.#unwrap(property.initializer);
      return value.kind !== ts.SyntaxKind.FalseKeyword && !(ts.isIdentifier(value) && value.text === "undefined");
    });
  }

  static #unwrap(expression: ts.Expression): ts.Expression {
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

  static #cannotBePolicy(expression: ts.Expression) {
    if (ts.isIdentifier(expression)) return expression.text === "undefined";
    return (
      ts.isLiteralExpression(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression) ||
      ts.isTemplateExpression(expression) ||
      ts.isArrayLiteralExpression(expression) ||
      ts.isArrowFunction(expression) ||
      ts.isFunctionExpression(expression) ||
      ts.isVoidExpression(expression) ||
      ts.isPrefixUnaryExpression(expression) ||
      [ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(expression.kind)
    );
  }

  static #fetchBindingsOf(sourceFile: ts.SourceFile) {
    const names = new Set<string>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const element of bindings.elements)
        if (!element.isTypeOnly && (element.propertyName ?? element.name).text === "fetch")
          names.add(element.name.text);
    }
    return names;
  }

  static #functionsOf(sourceFile: ts.SourceFile) {
    const functions = new Map<string, ts.Node>();
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && statement.body)
        functions.set(statement.name.text, statement.body);
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer && RenderMutationScanner.#unwrap(declaration.initializer);
        if (!ts.isIdentifier(declaration.name) || !initializer) continue;
        if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
          functions.set(declaration.name.text, initializer.body);
      }
    }
    return functions;
  }

  //? One level only: a function the stage calls, or renders as a component, runs while the route renders.
  static #helperOf(node: ts.Node, functions: Map<string, ts.Node>) {
    const callee = ts.isCallExpression(node)
      ? node.expression
      : ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)
        ? node.tagName
        : undefined;
    return callee && ts.isIdentifier(callee) ? functions.get(callee.text) : undefined;
  }

  static #renderBodiesOf(sourceFile: ts.SourceFile, functions: Map<string, ts.Node>) {
    const bodies: ts.Node[] = [];
    const bodyOf = (node: ts.Node) => (ts.isIdentifier(node) ? functions.get(node.text) : node);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        RenderMutationScanner.#stages.has(node.expression.name.text) &&
        RenderMutationScanner.#isRouteChain(node.expression.expression)
      )
        for (const argument of node.arguments) {
          const body = bodyOf(argument);
          if (body) bodies.push(body);
        }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    for (const statement of sourceFile.statements) {
      const legacy = RenderMutationScanner.#legacyPageOf(statement, functions);
      if (legacy) bodies.push(legacy);
    }
    return bodies;
  }

  static #isRouteChain(expression: ts.Expression) {
    let current = expression;
    while (ts.isCallExpression(current)) {
      if (ts.isIdentifier(current.expression)) return RenderMutationScanner.#builders.has(current.expression.text);
      if (!ts.isPropertyAccessExpression(current.expression)) return false;
      current = current.expression.expression;
    }
    return false;
  }

  static #legacyPageOf(statement: ts.Statement, functions: Map<string, ts.Node>) {
    if (ts.isFunctionDeclaration(statement))
      return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
        ? statement.body
        : undefined;
    if (!ts.isExportAssignment(statement)) return undefined;
    const expression = RenderMutationScanner.#unwrap(statement.expression);
    if (ts.isIdentifier(expression)) return functions.get(expression.text);
    return ts.isArrowFunction(expression) || ts.isFunctionExpression(expression) ? expression.body : undefined;
  }
}

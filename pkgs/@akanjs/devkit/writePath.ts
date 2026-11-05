import ts from "typescript";

//? Exclusive branches never run together, so only the busiest one counts; a write in a loop body or a per-element
//? callback runs once per item, so it counts as two.
export class WritePath {
  static readonly #perElement = new Set([
    "map",
    "flatMap",
    "forEach",
    "filter",
    "reduce",
    "some",
    "every",
    "find",
    "findIndex",
  ]);
  readonly #matches: (call: ts.CallExpression) => boolean;
  readonly #enters: (fn: ts.SignatureDeclaration) => boolean;
  readonly #repeated = new WeakSet<ts.CallExpression>();

  constructor(
    matches: (call: ts.CallExpression) => boolean,
    { enters = () => true }: { enters?: (fn: ts.SignatureDeclaration) => boolean } = {},
  ) {
    this.#matches = matches;
    this.#enters = enters;
  }

  along(node: ts.Node): ts.CallExpression[] {
    if (ts.isFunctionLike(node) && !this.#enters(node)) return [];
    if (WritePath.isPerElementCallback(node)) return this.#repeat(this.#children(node));
    if (ts.isForOfStatement(node) || ts.isForInStatement(node))
      return [...this.along(node.expression), ...this.#repeat(this.along(node.statement))];
    if (ts.isForStatement(node))
      return [
        ...(node.initializer ? this.along(node.initializer) : []),
        ...this.#repeat(
          [node.condition, node.incrementor, node.statement].flatMap((part) => (part ? this.along(part) : [])),
        ),
      ];
    if (ts.isWhileStatement(node) || ts.isDoStatement(node))
      return this.#repeat([...this.along(node.expression), ...this.along(node.statement)]);
    if (ts.isBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node)) return this.#sequence(node.statements);
    if (ts.isIfStatement(node))
      return [
        ...this.along(node.expression),
        ...this.#busier(this.along(node.thenStatement), node.elseStatement ? this.along(node.elseStatement) : []),
      ];
    if (ts.isConditionalExpression(node))
      return [...this.along(node.condition), ...this.#busier(this.along(node.whenTrue), this.along(node.whenFalse))];
    if (ts.isSwitchStatement(node))
      return [
        ...this.along(node.expression),
        ...node.caseBlock.clauses.map((clause) => this.along(clause)).reduce(this.#busier, []),
      ];
    const own = ts.isCallExpression(node) && this.#matches(node) ? [node] : [];
    return [...own, ...this.#children(node)];
  }

  isRepeated(call: ts.CallExpression) {
    return this.#repeated.has(call);
  }

  countOf(calls: ts.CallExpression[]) {
    return calls.reduce((count, call) => count + (this.isRepeated(call) ? 2 : 1), 0);
  }

  labelOf(call: ts.CallExpression, sourceFile: ts.SourceFile) {
    const callee = call.expression.getText(sourceFile);
    return this.isRepeated(call) ? `${callee} (per item)` : callee;
  }

  static isPerElementCallback(node: ts.Node) {
    const call = node.parent;
    return (
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      !!call &&
      ts.isCallExpression(call) &&
      call.arguments.some((arg) => arg === node) &&
      ts.isPropertyAccessExpression(call.expression) &&
      WritePath.#perElement.has(call.expression.name.text)
    );
  }

  #children(node: ts.Node) {
    const children: ts.Node[] = [];
    ts.forEachChild(node, (child) => {
      children.push(child);
    });
    return children.flatMap((child) => this.along(child));
  }

  #repeat(calls: ts.CallExpression[]) {
    for (const call of calls) this.#repeated.add(call);
    return calls;
  }

  #sequence(statements: readonly ts.Statement[]): ts.CallExpression[] {
    const calls: ts.CallExpression[] = [];
    for (const [idx, statement] of statements.entries()) {
      if (ts.isIfStatement(statement) && !statement.elseStatement && WritePath.#exits(statement.thenStatement))
        return [
          ...calls,
          ...this.along(statement.expression),
          ...this.#busier(this.along(statement.thenStatement), this.#sequence(statements.slice(idx + 1))),
        ];
      calls.push(...this.along(statement));
    }
    return calls;
  }

  static #exits(statement: ts.Statement): boolean {
    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true;
    const last = ts.isBlock(statement) ? statement.statements.at(-1) : undefined;
    return !!last && WritePath.#exits(last);
  }

  #busier = (a: ts.CallExpression[], b: ts.CallExpression[]) => (this.countOf(b) > this.countOf(a) ? b : a);
}

import ts from "typescript";

interface Flow {
  through: ts.CallExpression[] | null;
  exit: ts.CallExpression[] | null;
  jump: ts.CallExpression[] | null;
}

//? Exclusive branches never run together, so only the busiest one counts, a branch that returns included; a write in
//? a loop over items or a per-element callback runs once per item, so it counts as two.
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
    if (WritePath.#isFlowStatement(node)) return this.#busiestOf(this.#flowOf(node));
    if (ts.isConditionalExpression(node))
      return [...this.along(node.condition), ...this.#busier(this.along(node.whenTrue), this.along(node.whenFalse))];
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

  #flowOf(node: ts.Statement): Flow {
    if (ts.isBlock(node)) return this.#sequenceOf(node.statements);
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node))
      return { through: null, exit: node.expression ? this.along(node.expression) : [], jump: null };
    if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) return { through: null, exit: null, jump: [] };
    if (ts.isLabeledStatement(node)) return this.#flowOf(node.statement);
    if (ts.isIfStatement(node))
      return WritePath.#prefixed(
        this.along(node.expression),
        this.#merged(
          this.#flowOf(node.thenStatement),
          node.elseStatement ? this.#flowOf(node.elseStatement) : WritePath.#onward([]),
        ),
      );
    if (ts.isSwitchStatement(node)) return WritePath.#prefixed(this.along(node.expression), this.#switchOf(node));
    if (ts.isTryStatement(node)) return this.#tryOf(node);
    if (ts.isForOfStatement(node) || ts.isForInStatement(node))
      return this.#loopOf(this.along(node.expression), [], node.statement, true);
    if (ts.isForStatement(node))
      return this.#loopOf(
        node.initializer ? this.along(node.initializer) : [],
        [node.condition, node.incrementor].flatMap((part) => (part ? this.along(part) : [])),
        node.statement,
        WritePath.#walksItems(node.condition),
      );
    if (ts.isWhileStatement(node) || ts.isDoStatement(node))
      return this.#loopOf([], this.along(node.expression), node.statement, WritePath.#walksItems(node.expression));
    return WritePath.#onward(this.along(node));
  }

  #sequenceOf(statements: readonly ts.Statement[]): Flow {
    let through: ts.CallExpression[] | null = [];
    let exit: ts.CallExpression[] | null = null;
    let jump: ts.CallExpression[] | null = null;
    for (const statement of statements) {
      if (through === null) break;
      const flow = this.#flowOf(statement);
      if (flow.exit) exit = this.#busierOf(exit, [...through, ...flow.exit]);
      if (flow.jump) jump = this.#busierOf(jump, [...through, ...flow.jump]);
      through = flow.through && [...through, ...flow.through];
    }
    return { through, exit, jump };
  }

  //? A clause without `break` runs on into the next one; `break` leaves the switch and goes on after it.
  #switchOf(node: ts.SwitchStatement): Flow {
    const hasDefault = node.caseBlock.clauses.some(ts.isDefaultClause);
    let flow: Flow = { through: hasDefault ? null : [], exit: null, jump: null };
    let fallen: ts.CallExpression[] | null = null;
    for (const clause of node.caseBlock.clauses) {
      const entry = fallen && this.countOf(fallen) > 0 ? fallen : [];
      const own = WritePath.#prefixed(entry, this.#sequenceOf(clause.statements));
      flow = this.#merged(flow, { through: own.jump, exit: own.exit, jump: null });
      fallen = own.through;
    }
    return this.#merged(flow, { through: fallen, exit: null, jump: null });
  }

  //? A catch runs after whatever the try sent before it threw, so both count; a finally follows every path.
  #tryOf(node: ts.TryStatement): Flow {
    const tried = this.#flowOf(node.tryBlock);
    const sent = this.#busiestOf(tried);
    const caught = node.catchClause
      ? WritePath.#prefixed(sent, this.#flowOf(node.catchClause.block))
      : { through: null, exit: sent, jump: null };
    const flow = this.#merged(tried, caught);
    if (!node.finallyBlock) return flow;
    const after = this.#busiestOf(this.#flowOf(node.finallyBlock));
    return {
      through: flow.through && [...flow.through, ...after],
      exit: flow.exit && [...flow.exit, ...after],
      jump: flow.jump && [...flow.jump, ...after],
    };
  }

  //? An iteration that leaves the function sends its writes once; one that goes on repeats them for a loop over items.
  #loopOf(once: ts.CallExpression[], everyTurn: ts.CallExpression[], body: ts.Statement, isPerItem: boolean): Flow {
    const flow = this.#flowOf(body);
    const turn = [...everyTurn, ...(this.#busierOf(flow.through, flow.jump) ?? [])];
    const repeated = isPerItem ? this.#repeat(turn) : turn;
    return { through: [...once, ...repeated], exit: flow.exit && [...once, ...flow.exit], jump: null };
  }

  #merged(a: Flow, b: Flow): Flow {
    return {
      through: this.#busierOf(a.through, b.through),
      exit: this.#busierOf(a.exit, b.exit),
      jump: this.#busierOf(a.jump, b.jump),
    };
  }

  #busiestOf({ through, exit, jump }: Flow) {
    return this.#busierOf(this.#busierOf(through, exit), jump) ?? [];
  }

  #busierOf(a: ts.CallExpression[] | null, b: ts.CallExpression[] | null) {
    return a && b ? this.#busier(a, b) : (a ?? b);
  }

  static #onward(calls: ts.CallExpression[]): Flow {
    return { through: calls, exit: null, jump: null };
  }

  static #prefixed(calls: ts.CallExpression[], { through, exit, jump }: Flow): Flow {
    return {
      through: through && [...calls, ...through],
      exit: exit && [...calls, ...exit],
      jump: jump && [...calls, ...jump],
    };
  }

  static #isFlowStatement(node: ts.Node): node is ts.Statement {
    return (
      ts.isBlock(node) ||
      ts.isIfStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isTryStatement(node) ||
      ts.isLabeledStatement(node) ||
      ts.isReturnStatement(node) ||
      ts.isThrowStatement(node) ||
      ts.isBreakStatement(node) ||
      ts.isContinueStatement(node) ||
      ts.isIterationStatement(node, false)
    );
  }

  //? A loop bound by `xs.length` or asking a call for more (`while (await next())`) walks items; a bound it counts
  //? itself (`i < 3`, `!ok`) is a retry or a poll, which sends one write however many times it tries.
  static #walksItems(node: ts.Node | undefined): boolean {
    if (!node) return false;
    if (ts.isCallExpression(node)) return true;
    if (ts.isPropertyAccessExpression(node) && ["length", "size"].includes(node.name.text)) return true;
    return !!ts.forEachChild(node, (child) => WritePath.#walksItems(child) || undefined);
  }

  #busier = (a: ts.CallExpression[], b: ts.CallExpression[]) => (this.countOf(b) > this.countOf(a) ? b : a);
}

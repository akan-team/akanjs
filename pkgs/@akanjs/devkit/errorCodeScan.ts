import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { MaintainabilityLimits } from "./maintainabilityLimits";

export interface ErrorCodeRow {
  code: string | null;
  byStatus: boolean;
  statusCode: number | null;
  error: string;
  forwarded: boolean;
  wire: boolean;
  file: string;
}

const byStatus = Symbol("byStatus");

type Value = string | number | undefined | typeof byStatus;
type Values = readonly Value[] | null;
type Env = ReadonlyMap<string, Binding>;
type Pins = ReadonlyMap<ts.ParameterDeclaration, Value>;

interface Binding {
  values: Values;
  source: { expression: ts.Expression; env: Env } | null;
}

interface Call {
  args: readonly ts.Expression[];
  env: Env;
}

interface Evaluation {
  codes: Values;
  statuses: Values;
}

type ClassNode = ts.ClassDeclaration | ts.ClassExpression;

const unwrapped = (expression: ts.Expression) => {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  )
    current = current.expression;
  return current;
};

const isClassNode = (node: ts.Node | undefined): node is ClassNode =>
  !!node && (ts.isClassDeclaration(node) || ts.isClassExpression(node));

const statusCodeOf = (property: ts.ObjectLiteralElementLike): ts.Expression | null => {
  if (ts.isPropertyAssignment(property) && property.name.getText() === "statusCode") return property.initializer;
  if (ts.isShorthandPropertyAssignment(property) && property.name.text === "statusCode") return property.name;
  return null;
};

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export class ErrorCodeScan {
  readonly #dir: string;
  readonly #roots: ReadonlySet<string>;
  readonly #program: ts.Program;
  readonly #checker: ts.TypeChecker;
  readonly #akanError: ts.ClassDeclaration;
  readonly #statuses: ReadonlyMap<number, readonly [code: string, reason: string]>;
  readonly #callSites = new Map<ClassNode, Call[]>();
  readonly #descends = new Map<ClassNode, boolean>();

  constructor(akanjsDir: string) {
    this.#dir = akanjsDir;
    this.#roots = ErrorCodeScan.#rootsOf(akanjsDir);
    const configPath = path.join(akanjsDir, "tsconfig.json");
    const config = ts.sys.fileExists(configPath) ? ts.readConfigFile(configPath, ts.sys.readFile).config : {};
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, akanjsDir, undefined, configPath);
    this.#program = ts.createProgram({
      rootNames: [...this.#roots].map((file) => path.join(akanjsDir, file)),
      options: { ...parsed.options, noEmit: true },
    });
    this.#checker = this.#program.getTypeChecker();
    const base = this.#program.getSourceFile(path.join(akanjsDir, "base", "akanError.ts"));
    const akanError = base?.statements.find(
      (statement): statement is ts.ClassDeclaration =>
        ts.isClassDeclaration(statement) && statement.name?.text === "AkanError",
    );
    if (!akanError) throw new Error(`${akanjsDir}/base/akanError.ts declares no AkanError class`);
    this.#akanError = akanError;
    this.#statuses = ErrorCodeScan.#statusTableOf(akanError);
  }

  get statuses() {
    return this.#statuses;
  }

  rows(): ErrorCodeRow[] {
    const classes = this.#classes();
    for (const call of this.#newExpressions()) {
      const target = this.#classOf(call.expression);
      if (target && classes.includes(target))
        this.#callSites.set(target, [
          ...(this.#callSites.get(target) ?? []),
          { args: call.arguments ?? [], env: new Map() },
        ]);
    }
    const rows = new Map<string, ErrorCodeRow>();
    for (const node of classes) {
      const forwardedOf = this.#forwardedOf(node);
      const toJsonHasCode = this.#toJsonHasCode(node);
      const file = this.#relative(node.getSourceFile().fileName);
      for (const { codes, statuses } of this.#evaluationsOf(node))
        for (const code of codes ?? [null])
          for (const statusCode of statuses ?? [null]) {
            const forwarded = forwardedOf(code);
            const row: ErrorCodeRow = {
              code: typeof code === "string" ? code : null,
              byStatus: code === byStatus,
              statusCode: typeof statusCode === "number" ? statusCode : null,
              error: this.#nameOf(node),
              forwarded,
              wire: !forwarded || toJsonHasCode,
              file,
            };
            rows.set(`${row.code}|${row.byStatus}|${row.statusCode}|${row.error}|${row.file}`, row);
          }
    }
    return [...rows.values()].sort(ErrorCodeScan.#byCode);
  }

  #evaluationsOf(node: ClassNode): Evaluation[] {
    const sites = this.#callSites.get(node) ?? [];
    if (node === this.#akanError) return sites.map((call) => this.#akanErrorCall(call));
    const free = this.#evaluate(node, null);
    if (free.codes !== null && free.statuses !== null) return this.#perCode(node, free);
    return sites.length ? sites.map((call) => this.#evaluate(node, call)) : [free];
  }

  #perCode(node: ClassNode, free: Evaluation): Evaluation[] {
    const codes = free.codes ?? [];
    if (codes.length < 2 || (free.statuses?.length ?? 0) < 2) return [free];
    const parameter = this.#freeParametersOf(node).find((each) => {
      const values = this.#literalsOf(this.#checker.getTypeAtLocation(each.name));
      return values?.length === codes.length && values.every((value) => codes.includes(value));
    });
    if (!parameter) return [free];
    return codes.map((code) => this.#evaluate(node, null, new Map([[parameter, code]])));
  }

  #freeParametersOf(node: ClassNode): readonly ts.ParameterDeclaration[] {
    for (
      let current: ClassNode | null = node;
      current && current !== this.#akanError;
      current = this.#baseOf(current)
    ) {
      const ctor = current.members.find(
        (member): member is ts.ConstructorDeclaration => ts.isConstructorDeclaration(member) && !!member.body,
      );
      if (ctor) return ctor.parameters;
    }
    return [];
  }

  #evaluate(node: ClassNode, call: Call | null, pins: Pins = new Map()): Evaluation {
    const base = this.#baseOf(node);
    const ctor = node.members.find(
      (member): member is ts.ConstructorDeclaration => ts.isConstructorDeclaration(member) && !!member.body,
    );
    if (!ctor) {
      if (base === this.#akanError) return this.#akanErrorCall(call);
      return base ? this.#evaluate(base, call, pins) : { codes: null, statuses: null };
    }
    const env = new Map<string, Binding>();
    ctor.parameters.forEach((parameter, idx) => {
      if (!ts.isIdentifier(parameter.name)) return;
      env.set(parameter.name.text, this.#bindingOf(parameter, idx, call, env, pins));
    });
    const superCall = ctor.body?.statements
      .map((statement) => (ts.isExpressionStatement(statement) ? unwrapped(statement.expression) : null))
      .find(
        (expression): expression is ts.CallExpression =>
          !!expression && ts.isCallExpression(expression) && expression.expression.kind === ts.SyntaxKind.SuperKeyword,
      );
    if (!superCall) return { codes: null, statuses: null };
    const passed: Call = { args: superCall.arguments, env };
    if (base === this.#akanError) return this.#akanErrorCall(passed);
    return base ? this.#evaluate(base, passed) : { codes: null, statuses: null };
  }

  #bindingOf(parameter: ts.ParameterDeclaration, idx: number, call: Call | null, env: Env, pins: Pins): Binding {
    if (call === null) {
      const pinned: Values = pins.has(parameter) ? [pins.get(parameter)] : null;
      return { values: pinned ?? this.#literalsOf(this.#checker.getTypeAtLocation(parameter.name)), source: null };
    }
    if (parameter.dotDotDotToken || call.args.slice(0, idx + 1).some(ts.isSpreadElement))
      return { values: null, source: null };
    const expression = call.args[idx] ?? parameter.initializer;
    if (!expression) return { values: [undefined], source: null };
    const scope = call.args[idx] ? call.env : env;
    return { values: this.#value(expression, scope), source: { expression, env: scope } };
  }

  #akanErrorCall(call: Call | null): Evaluation {
    if (!call) return { codes: null, statuses: null };
    const [code, , options] = call.args;
    return { codes: code ? this.#value(code, call.env) : null, statuses: this.#statusOf(options, call.env) };
  }

  #statusOf(options: ts.Expression | undefined, env: Env): Values {
    if (!options) return [500];
    const inner = unwrapped(options);
    const binding = ts.isIdentifier(inner) ? env.get(inner.text) : undefined;
    if (binding?.source) return this.#statusOf(binding.source.expression, binding.source.env);
    if (binding?.values?.every((each) => each === undefined)) return [500];
    if (!ts.isObjectLiteralExpression(inner)) return this.#holdsStatusCode(inner) ? null : [500];
    for (const property of [...inner.properties].reverse()) {
      if (ts.isSpreadAssignment(property)) {
        if (this.#holdsStatusCode(property.expression)) return null;
        continue;
      }
      const initializer = statusCodeOf(property);
      if (initializer) return this.#value(initializer, env)?.map((each) => (each === undefined ? 500 : each)) ?? null;
    }
    return [500];
  }

  #holdsStatusCode(expression: ts.Expression) {
    const type = this.#checker.getNonNullableType(this.#checker.getTypeAtLocation(expression));
    return !!type.getProperty("statusCode");
  }

  #value(expression: ts.Expression, env: Env): Values {
    const inner = unwrapped(expression);
    if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) return [inner.text];
    if (ts.isNumericLiteral(inner)) return [Number(inner.text)];
    if (ts.isConditionalExpression(inner)) {
      const holds = this.#holds(inner.condition, env);
      if (holds !== null) return this.#value(holds ? inner.whenTrue : inner.whenFalse, env);
      const [whenTrue, whenFalse] = [this.#value(inner.whenTrue, env), this.#value(inner.whenFalse, env)];
      return whenTrue && whenFalse ? [...new Set([...whenTrue, ...whenFalse])] : null;
    }
    if (ts.isIdentifier(inner)) {
      const binding = env.get(inner.text);
      if (binding) return binding.values;
      if (inner.text === "undefined") return [undefined];
    }
    if (ts.isElementAccessExpression(inner)) return this.#lookup(inner, env);
    if (ts.isCallExpression(inner) && this.#isCodeOfStatus(inner.expression)) {
      const [status] = inner.arguments;
      const statuses = status ? this.#value(status, env) : null;
      const known = statuses?.filter((each): each is number => typeof each === "number") ?? [];
      return statuses && known.length === statuses.length ? known.map((each) => this.#codeOf(each)) : [byStatus];
    }
    return this.#literalsOf(this.#checker.getTypeAtLocation(inner));
  }

  #holds(condition: ts.Expression, env: Env): boolean | null {
    const inner = unwrapped(condition);
    if (!ts.isBinaryExpression(inner)) return null;
    const operator = inner.operatorToken.kind;
    const equal = operator === ts.SyntaxKind.EqualsEqualsEqualsToken;
    if (!equal && operator !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return null;
    const [left, right] = [this.#value(inner.left, env), this.#value(inner.right, env)];
    if (left?.length !== 1 || right?.length !== 1) return null;
    return (left[0] === right[0]) === equal;
  }

  #lookup(access: ts.ElementAccessExpression, env: Env): Values {
    const table = this.#tableOf(access.expression);
    const keys = this.#value(access.argumentExpression, env);
    if (!table || !keys) return null;
    const values = new Set<Value>();
    for (const key of keys) {
      const entry = table.properties.find(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) &&
          property.name.text === String(key),
      );
      const found = entry ? this.#value(entry.initializer, new Map()) : null;
      if (!found) return null;
      for (const value of found) values.add(value);
    }
    return [...values];
  }

  #tableOf(expression: ts.Expression): ts.ObjectLiteralExpression | null {
    const symbol = this.#checker.getSymbolAtLocation(unwrapped(expression));
    for (const declaration of symbol?.declarations ?? []) {
      if (!ts.isPropertyDeclaration(declaration) || !declaration.initializer) continue;
      if (!(ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Readonly)) continue;
      const initializer = unwrapped(declaration.initializer);
      if (ts.isObjectLiteralExpression(initializer)) return initializer;
    }
    return null;
  }

  #codeOf(statusCode: number) {
    return this.#statuses.get(statusCode)?.[0] ?? `http${statusCode}`;
  }

  #isCodeOfStatus(callee: ts.Expression) {
    return (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "codeOfStatus" &&
      this.#classOf(callee.expression) === this.#akanError
    );
  }

  #literalsOf(type: ts.Type): Values {
    const members = type.isUnion() ? type.types : [type];
    const values: Value[] = [];
    for (const member of members) {
      if (member.isStringLiteral() || member.isNumberLiteral()) values.push(member.value);
      else if (!(member.flags & ts.TypeFlags.Undefined)) return null;
    }
    return values.length ? values : null;
  }

  #forwardedOf(node: ClassNode): (code: Value | null) => boolean {
    for (let current: ClassNode | null = node; current; current = this.#baseOf(current)) {
      const getter = current.members.find(
        (member): member is ts.GetAccessorDeclaration =>
          ts.isGetAccessorDeclaration(member) && member.name.getText() === "forwarded",
      );
      if (!getter) continue;
      const [statement, ...rest] = getter.body?.statements ?? [];
      const returned =
        statement && !rest.length && ts.isReturnStatement(statement) && statement.expression
          ? unwrapped(statement.expression)
          : null;
      if (returned?.kind === ts.SyntaxKind.TrueKeyword) return () => true;
      if (returned?.kind === ts.SyntaxKind.FalseKeyword) return () => false;
      const byCode = returned ? ErrorCodeScan.#codeComparisonOf(returned) : null;
      if (byCode) return byCode;
      throw new Error(
        `${this.#nameOf(current)}'s forwarded getter returns more than a literal true or false, or this.code compared to a literal`,
      );
    }
    return () => false;
  }

  static #codeComparisonOf(expression: ts.Expression): ((code: Value | null) => boolean) | null {
    if (!ts.isBinaryExpression(expression)) return null;
    const operator = expression.operatorToken.kind;
    const equal = operator === ts.SyntaxKind.EqualsEqualsEqualsToken;
    if (!equal && operator !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return null;
    const isThisCode = (side: ts.Expression) => {
      const property = unwrapped(side);
      return (
        ts.isPropertyAccessExpression(property) &&
        property.expression.kind === ts.SyntaxKind.ThisKeyword &&
        property.name.text === "code"
      );
    };
    const literalOf = (side: ts.Expression) => {
      const literal = unwrapped(side);
      return ts.isStringLiteralLike(literal) ? literal.text : null;
    };
    const compared = isThisCode(expression.left)
      ? literalOf(expression.right)
      : isThisCode(expression.right)
        ? literalOf(expression.left)
        : null;
    if (compared === null) return null;
    return (code) => (code === compared) === equal;
  }

  #toJsonHasCode(node: ClassNode): boolean {
    for (let current: ClassNode | null = node; current; current = this.#baseOf(current)) {
      if (current === this.#akanError) return true;
      const method = current.members.find(
        (member): member is ts.MethodDeclaration =>
          ts.isMethodDeclaration(member) && member.name.getText() === "toJSON",
      );
      if (!method) continue;
      const returned = method.body?.statements.find(ts.isReturnStatement)?.expression;
      const base = this.#baseOf(current);
      return !!returned && this.#carriesCode(returned, base);
    }
    return true;
  }

  #carriesCode(expression: ts.Expression, base: ClassNode | null): boolean {
    const inner = unwrapped(expression);
    if (ts.isConditionalExpression(inner))
      return this.#carriesCode(inner.whenTrue, base) || this.#carriesCode(inner.whenFalse, base);
    if (ts.isCallExpression(inner) && ts.isPropertyAccessExpression(inner.expression))
      return inner.expression.expression.kind === ts.SyntaxKind.SuperKeyword && !!base && this.#toJsonHasCode(base);
    if (!ts.isObjectLiteralExpression(inner)) return false;
    return inner.properties.some((property) =>
      ts.isSpreadAssignment(property)
        ? this.#carriesCode(property.expression, base)
        : property.name?.getText() === "code",
    );
  }

  #classes(): ClassNode[] {
    const classes: ClassNode[] = [this.#akanError];
    const visit = (node: ts.Node) => {
      if (isClassNode(node) && node !== this.#akanError && this.#descendsFromAkanError(node)) classes.push(node);
      ts.forEachChild(node, visit);
    };
    for (const sourceFile of this.#ownSources()) visit(sourceFile);
    return classes;
  }

  #descendsFromAkanError(node: ClassNode): boolean {
    const known = this.#descends.get(node);
    if (known !== undefined) return known;
    this.#descends.set(node, false);
    const base = this.#baseOf(node);
    const descends = !!base && (base === this.#akanError || this.#descendsFromAkanError(base));
    this.#descends.set(node, descends);
    return descends;
  }

  #baseOf(node: ClassNode): ClassNode | null {
    const extended = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
    return extended ? this.#classOf(extended.expression) : null;
  }

  #classOf(expression: ts.Expression): ClassNode | null {
    let symbol = this.#checker.getSymbolAtLocation(expression);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = this.#checker.getAliasedSymbol(symbol);
    for (const declaration of symbol?.declarations ?? []) {
      if (isClassNode(declaration)) return declaration;
      if (ts.isPropertyDeclaration(declaration) && declaration.initializer) {
        const initializer = unwrapped(declaration.initializer);
        if (isClassNode(initializer)) return initializer;
      }
    }
    return null;
  }

  #nameOf(node: ClassNode) {
    const { parent } = node;
    if (ts.isPropertyDeclaration(parent) && isClassNode(parent.parent) && parent.parent.name)
      return `${parent.parent.name.text}.${parent.name.getText()}`;
    return node.name?.text ?? "(anonymous)";
  }

  #newExpressions() {
    const found: ts.NewExpression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isNewExpression(node)) found.push(node);
      ts.forEachChild(node, visit);
    };
    for (const sourceFile of this.#ownSources()) visit(sourceFile);
    return found;
  }

  #ownSources() {
    return this.#program.getSourceFiles().filter((sourceFile) => this.#roots.has(this.#relative(sourceFile.fileName)));
  }

  #relative(fileName: string) {
    return path.relative(this.#dir, fileName).split(path.sep).join("/");
  }

  //? Tracked files only, unlike the gate: an untracked scratch file would otherwise shift the page CI compares.
  static #sourcesOf(dir: string) {
    const listed = Bun.spawnSync(["git", "ls-files", "-z", "--", "."], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    if (listed.exitCode !== 0) throw new Error(`git ls-files failed in ${dir}: ${listed.stderr.toString().trim()}`);
    return listed.stdout
      .toString()
      .split("\0")
      .filter((file) => file && !file.includes("node_modules/") && MaintainabilityLimits.isPackageSource(file));
  }

  //? Parsing every source costs seconds; a file that names no AkanError descendant can neither declare nor build one.
  static #rootsOf(dir: string) {
    const texts = ErrorCodeScan.#sourcesOf(dir)
      .filter((file) => existsSync(path.join(dir, file)))
      .map((file) => [file, readFileSync(path.join(dir, file), "utf8")] as const);
    const edges = texts.flatMap(([, text]) => [...ErrorCodeScan.#extendsIn(text)]);
    const names = new Set(["AkanError"]);
    for (let grown = true; grown; ) {
      grown = false;
      for (const [name, base] of edges) {
        if (!names.has(base) || names.has(name)) continue;
        names.add(name);
        grown = true;
      }
    }
    const escaped = [...names].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const mention = new RegExp(`(?<![\\w$])(?:${escaped.join("|")})(?![\\w$])`);
    return new Set(texts.filter(([, text]) => mention.test(text)).map(([file]) => file));
  }

  static *#extendsIn(text: string): Generator<readonly [name: string, base: string]> {
    for (const head of text.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)\s*/g)) {
      const [matched, name] = head;
      if (!name) continue;
      let at = head.index + matched.length;
      for (let depth = 0; at < text.length && (text[at] === "<" || depth > 0); at++) {
        if (text[at] === "<") depth++;
        else if (text[at] === ">" && text[at - 1] !== "=") depth--;
      }
      const heritage = /\s*extends\s+([A-Za-z_$][\w$]*)/y;
      heritage.lastIndex = at;
      const extended: RegExpExecArray | null = heritage.exec(text);
      const base = extended?.[1];
      if (base) yield [name, base];
    }
  }

  static #statusTableOf(akanError: ts.ClassDeclaration) {
    const table = new Map<number, readonly [string, string]>();
    const property = akanError.members.find(
      (member): member is ts.PropertyDeclaration =>
        ts.isPropertyDeclaration(member) && member.name.getText() === "#statuses",
    );
    const initializer = property?.initializer ? unwrapped(property.initializer) : null;
    if (!initializer || !ts.isObjectLiteralExpression(initializer))
      throw new Error("AkanError holds no #statuses table to name a status's code by");
    for (const entry of initializer.properties) {
      if (!ts.isPropertyAssignment(entry) || !ts.isArrayLiteralExpression(entry.initializer)) continue;
      const [code, reason] = entry.initializer.elements;
      if (code && reason && ts.isStringLiteral(code) && ts.isStringLiteral(reason))
        table.set(Number(entry.name.getText()), [code.text, reason.text]);
    }
    return table;
  }

  static #byCode(a: ErrorCodeRow, b: ErrorCodeRow) {
    return (
      byCodeUnit(a.code ?? "~", b.code ?? "~") ||
      Number(a.byStatus) - Number(b.byStatus) ||
      (a.statusCode ?? 0) - (b.statusCode ?? 0) ||
      byCodeUnit(a.error, b.error)
    );
  }
}

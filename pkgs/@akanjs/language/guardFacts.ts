import type * as TS from "typescript";
import type { AkanAst, Ts } from "./ast";
import type { AkanSpan, Extent, ImportFact, MemberFact } from "./moduleFacts";

export interface GuardFact extends MemberFact {
  scope: string | null;
  doc: string | null;
  factory: string | null;
}

export interface GuardFactoryFact extends MemberFact {
  scope: string | null;
  doc: string | null;
  direct: boolean;
  via: string[];
}

export interface GuardCallFact extends MemberFact {
  callee: string;
  kind: "call" | "extends";
  scope: string | null;
  doc: string | null;
}

export interface InPlaceGuard {
  call: TS.CallExpression;
  name: string;
}

export const guardLabelOf = (guard: string, labels: Record<string, string>) => {
  const [, role = null, local = guard] = guard.match(/^([\w$]+) (.+)$/) ?? [];
  const label = labels[local];
  return label === undefined ? guard : role ? `${role} ${label}` : label;
};

interface GuardReaderBase {
  spanOf: (source: TS.SourceFile, node: TS.Node) => AkanSpan;
  extentOf: (source: TS.SourceFile, node: TS.Node) => Extent;
  unwrap: (expression: TS.Expression) => TS.Expression;
  docOf: (source: TS.SourceFile, node: TS.Node) => string | null;
}

const maxLabelArgs = 32;

export const createGuardFactReader = (ts: Ts, ast: AkanAst, { spanOf, extentOf, unwrap, docOf }: GuardReaderBase) => {
  const pathOf = (expression: TS.Expression): string | null => {
    if (ts.isIdentifier(expression)) return expression.text;
    if (!ts.isPropertyAccessExpression(expression)) return null;
    const head = pathOf(expression.expression);
    return head && `${head}.${expression.name.text}`;
  };

  const calleeOf = (call: TS.CallExpression) => pathOf(unwrap(call.expression)) ?? "?";

  const labelOf = (source: TS.SourceFile, call: TS.CallExpression) => {
    const args = call.arguments.map((arg) => arg.getText(source)).join(", ");
    return `${calleeOf(call)}(${args.length <= maxLabelArgs && !args.includes("\n") ? args : "…"})`;
  };

  //? Editing a lambda argument, or a guard on another member, keeps the id.
  const guardRefOf = (expression: TS.Expression, made: InPlaceGuard[], member: string) => {
    const value = unwrap(expression);
    if (!ts.isCallExpression(value)) return pathOf(value) ?? ast.expressionName(value);
    const prefix = `${member}:${calleeOf(value)}@`;
    const name = `${prefix}${made.filter((other) => other.name.startsWith(prefix)).length + 1}`;
    made.push({ call: value, name });
    return name;
  };

  const guardsIn = (
    source: TS.SourceFile,
    object: TS.ObjectLiteralExpression | undefined,
    made: InPlaceGuard[],
    member: string,
  ) => {
    const guards = object?.properties.find(
      (property): property is TS.PropertyAssignment =>
        ts.isPropertyAssignment(property) && ast.nodeName(property.name) === "guards",
    )?.initializer;
    if (!guards) return [];
    const refOf = (expression: TS.Expression) => guardRefOf(expression, made, member);
    if (ts.isArrayLiteralExpression(guards)) return guards.elements.map(refOf).filter((name) => name !== null);
    if (ts.isObjectLiteralExpression(guards))
      return guards.properties.filter(ts.isPropertyAssignment).flatMap((property) => {
        const value = unwrap(property.initializer);
        const names = ts.isArrayLiteralExpression(value) ? value.elements.map(refOf) : [refOf(value)];
        return names.map((name) => `${ast.nodeName(property.name)} ${name ?? "?"}`);
      });
    const single = refOf(guards);
    return single ? [single] : [];
  };

  const implementsGuard = (node: TS.ClassLikeDeclaration, guardNames: ReadonlySet<string>) =>
    !!node.heritageClauses?.some(
      (clause) =>
        clause.token === ts.SyntaxKind.ImplementsKeyword &&
        clause.types.some(({ expression }) => guardNames.has(ast.expressionName(expression) ?? "")),
    );

  const scopeOf = (node: TS.ClassLikeDeclaration) => {
    const scope = node.members.find(
      (member): member is TS.PropertyDeclaration =>
        ts.isPropertyDeclaration(member) &&
        ast.nodeName(member.name) === "scope" &&
        !!ts.getModifiers(member)?.some(({ kind }) => kind === ts.SyntaxKind.StaticKeyword),
    )?.initializer;
    const value = scope && unwrap(scope);
    return value && ts.isStringLiteralLike(value) ? value.text : null;
  };

  const functionsOf = (source: TS.SourceFile) => {
    const functions = new Map<string, { statement: TS.Statement; name: TS.Identifier; body: TS.Node }>();
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && statement.body)
        functions.set(statement.name.text, { statement, name: statement.name, body: statement.body });
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer && unwrap(declaration.initializer);
        if (
          initializer &&
          ts.isIdentifier(declaration.name) &&
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
        )
          functions.set(declaration.name.text, { statement, name: declaration.name, body: initializer.body });
      }
    }
    return functions;
  };

  const returnedOf = (body: TS.Node, guardNames: ReadonlySet<string>) => {
    const locals = new Map<string, TS.Node>();
    const pending: TS.Node[] = [];
    const visit = (node: TS.Node) => {
      if (ts.isClassDeclaration(node) && node.name) locals.set(node.name.text, node);
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
        locals.set(node.name.text, node.initializer);
      if (ts.isReturnStatement(node) && node.expression) pending.push(node.expression);
      if (!ts.isFunctionLike(node) && !ts.isClassLike(node)) ts.forEachChild(node, visit);
    };
    if (ts.isBlock(body)) ts.forEachChild(body, visit);
    else pending.push(body);
    let guard: TS.ClassLikeDeclaration | null = null;
    const calls: string[] = [];
    const seen = new Set<TS.Node>();
    const passed = new Set<TS.Node>();
    for (let node = pending.pop(); node; node = pending.pop()) {
      if (seen.has(node)) continue;
      seen.add(node);
      const value = ts.isExpression(node) ? unwrap(node) : node;
      if ((ts.isClassExpression(value) || ts.isClassDeclaration(value)) && implementsGuard(value, guardNames))
        guard ??= value;
      else if (ts.isConditionalExpression(value)) pending.push(value.whenTrue, value.whenFalse);
      else if (ts.isBinaryExpression(value)) pending.push(value.left, value.right);
      else if (ts.isIdentifier(value)) {
        const local = locals.get(value.text);
        if (local) pending.push(local);
      } else if (ts.isCallExpression(value)) {
        const callee = pathOf(unwrap(value.expression));
        if (callee && !passed.has(node) && !calls.includes(callee)) calls.push(callee);
        for (const arg of value.arguments) passed.add(arg);
        pending.push(...value.arguments);
      }
    }
    return { guard, calls };
  };

  //? A function returning a call to an import is kept as a factory: only the graph knows whether that import makes one.
  const guardFactoriesOf = (
    source: TS.SourceFile,
    guardNames: ReadonlySet<string>,
    isImported: (callee: string) => boolean,
  ) => {
    const functions = functionsOf(source);
    const returned = new Map([...functions].map(([name, { body }]) => [name, returnedOf(body, guardNames)]));
    const members = new Set<string>();
    const isFactoryCall = (callee: string) => members.has(callee) || (!functions.has(callee) && isImported(callee));
    for (let isGrowing = true; isGrowing; ) {
      isGrowing = false;
      for (const [name, { guard, calls }] of returned) {
        if (members.has(name) || (!guard && !calls.some(isFactoryCall))) continue;
        members.add(name);
        isGrowing = true;
      }
    }
    const factories = new Map<string, GuardFactoryFact>();
    for (const name of members) {
      const found = functions.get(name);
      const made = returned.get(name);
      if (!found || !made) continue;
      factories.set(name, {
        name,
        span: spanOf(source, found.name),
        extent: extentOf(source, found.statement),
        scope: made.guard ? scopeOf(made.guard) : null,
        doc: docOf(source, found.statement),
        direct: !!made.guard,
        via: made.calls.filter(isFactoryCall),
      });
    }
    return factories;
  };

  const guardsOf = (source: TS.SourceFile, imports: ImportFact[], madeInPlace: InPlaceGuard[]) => {
    const guardNames = new Set([
      "Guard",
      ...imports.filter(({ imported }) => imported === "Guard").map(({ name }) => name),
    ]);
    const imported = new Set(imports.map(({ name }) => name));
    const isImported = (callee: string) => imported.has(callee.split(".")[0] ?? callee);
    const factories = guardFactoriesOf(source, guardNames, isImported);
    const guards: GuardFact[] = [];
    const calls: GuardCallFact[] = [];
    const makeOf = (made: MemberFact & { doc: string | null }, value: TS.Expression, isInPlace = false) => {
      if (ts.isClassExpression(value) && implementsGuard(value, guardNames)) {
        guards.push({ ...made, scope: scopeOf(value), factory: null });
        return;
      }
      const callee = ts.isCallExpression(value) ? pathOf(unwrap(value.expression)) : null;
      const factory = callee && factories.get(callee);
      if (factory) guards.push({ ...made, scope: factory.scope, factory: factory.name });
      else if (callee && (isImported(callee) || isInPlace)) calls.push({ ...made, callee, kind: "call", scope: null });
    };
    for (const statement of source.statements) {
      if (ts.isClassDeclaration(statement) && statement.name) {
        const declared = {
          name: statement.name.text,
          span: spanOf(source, statement.name),
          extent: extentOf(source, statement),
          scope: scopeOf(statement),
          doc: docOf(source, statement),
        };
        const base = statement.heritageClauses?.find(({ token }) => token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
        const callee = base && pathOf(base.expression);
        if (implementsGuard(statement, guardNames)) guards.push({ ...declared, factory: null });
        else if (callee) calls.push({ ...declared, callee, kind: "extends" });
      }
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer && unwrap(declaration.initializer);
        if (!initializer || !ts.isIdentifier(declaration.name)) continue;
        const holder = declaration.name.text;
        makeOf(
          {
            name: holder,
            span: spanOf(source, declaration.name),
            extent: extentOf(source, statement),
            doc: docOf(source, statement),
          },
          initializer,
        );
        if (!ts.isObjectLiteralExpression(initializer)) continue;
        for (const property of initializer.properties) {
          const key = ts.isPropertyAssignment(property) ? ast.nodeName(property.name) : null;
          if (key && ts.isPropertyAssignment(property))
            makeOf(
              {
                name: `${holder}.${key}`,
                span: spanOf(source, property.name),
                extent: extentOf(source, property),
                doc: docOf(source, property),
              },
              unwrap(property.initializer),
            );
        }
      }
    }
    for (const { call, name } of madeInPlace)
      makeOf({ name, span: spanOf(source, call), extent: extentOf(source, call), doc: null }, call, true);
    const guardLabels = Object.fromEntries(madeInPlace.map(({ call, name }) => [name, labelOf(source, call)]));
    return { guards, guardFactories: [...factories.values()], guardCalls: calls, guardLabels };
  };

  return { guardsIn, guardsOf };
};

import type * as TS from "typescript";
import type { AkanAst, Ts } from "./ast";

export interface AkanSpan {
  fileName: string;
  start: number;
  end: number;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
}

export interface NamedFact {
  name: string;
  span: AkanSpan;
}

export interface Extent {
  start: number;
  end: number;
}

export interface MemberFact extends NamedFact {
  extent: Extent;
}

export interface SliceKeyFact extends MemberFact {
  guards: string[];
  live: boolean;
  argCount: number;
}

export interface EndpointKeyFact extends MemberFact {
  verb: string | null;
  guards: string[];
  argCount: number;
}

export interface FieldFact extends NamedFact {
  type: string | null;
  array: boolean;
  optional: boolean;
}

export interface ConstantClassFact extends NamedFact {
  fields: FieldFact[];
  parents: string[];
}

export interface EnumClassFact extends NamedFact {
  values: string[];
}

export interface FilterClassFact extends NamedFact {
  queries: NamedFact[];
}

export interface ModuleClassFact extends NamedFact {
  model: string | null;
}

export interface SliceClassFact extends ModuleClassFact {
  guards: string[];
  keys: SliceKeyFact[];
}

export interface EndpointClassFact extends ModuleClassFact {
  keys: EndpointKeyFact[];
}

export interface ServiceClassFact extends ModuleClassFact {
  methods: MemberFact[];
}

export interface StoreClassFact extends ModuleClassFact {
  stateKeys: NamedFact[];
  actions: MemberFact[];
}

export interface FileFacts {
  fileName: string;
  owner: string | null;
  constants: ConstantClassFact[];
  enums: EnumClassFact[];
  filters: FilterClassFact[];
  models: ModuleClassFact[];
  services: ServiceClassFact[];
  slices: SliceClassFact[];
  endpoints: EndpointClassFact[];
  stores: StoreClassFact[];
}

const moduleCallees = new Set(["via", "from", "into", "serve", "slice", "endpoint", "store", "enumOf"]);
const argMethods = new Set(["param", "body", "search", "room", "msg"]);

export const ownerOf = (relativePath: string) => {
  const [root, name] = relativePath.split("/");
  return (root === "apps" || root === "libs") && name ? `${root}/${name}` : null;
};

export const createFactReader = (ts: Ts, ast: AkanAst) => {
  const spanOf = (source: TS.SourceFile, node: TS.Node): AkanSpan => {
    const start = node.getStart(source);
    const end = node.getEnd();
    const head = source.getLineAndCharacterOfPosition(start);
    const tail = source.getLineAndCharacterOfPosition(end);
    return {
      fileName: source.fileName,
      start,
      end,
      line: head.line,
      character: head.character,
      endLine: tail.line,
      endCharacter: tail.character,
    };
  };

  const extentOf = (source: TS.SourceFile, node: TS.Node): Extent => ({
    start: node.getStart(source),
    end: node.getEnd(),
  });

  const unwrap = (expression: TS.Expression): TS.Expression => {
    let current = expression;
    while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))
      current = current.expression;
    return current;
  };

  //? `srv.user.with(srv.util.security)` names its model before the first call.
  const moduleRefOf = (expression: TS.Expression | undefined, holder: string) => {
    let current = expression && unwrap(expression);
    while (current && ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression))
      current = current.expression.expression;
    if (current && ts.isStringLiteral(current)) return current.text;
    if (!current || !ts.isPropertyAccessExpression(current)) return null;
    return ts.isIdentifier(current.expression) && current.expression.text === holder ? current.name.text : null;
  };

  const returnedObject = (builder: TS.ArrowFunction | TS.FunctionExpression | undefined) =>
    builder ? ast.firstObjectReturnedByArrow(builder) : null;

  const builderOf = (call: TS.CallExpression) =>
    [...call.arguments].reverse().find((arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) as
      | TS.ArrowFunction
      | TS.FunctionExpression
      | undefined;

  const guardsIn = (object: TS.ObjectLiteralExpression | undefined) => {
    const guards = object?.properties.find(
      (property): property is TS.PropertyAssignment =>
        ts.isPropertyAssignment(property) && ast.nodeName(property.name) === "guards",
    )?.initializer;
    if (!guards) return [];
    if (ts.isArrayLiteralExpression(guards))
      return guards.elements.map((element) => ast.expressionName(element)).filter((name) => name !== null);
    if (ts.isObjectLiteralExpression(guards))
      return guards.properties
        .filter(ts.isPropertyAssignment)
        .map((property) => `${ast.nodeName(property.name)} ${ast.expressionName(property.initializer) ?? "?"}`);
    const single = ast.expressionName(guards);
    return single ? [single] : [];
  };

  const optionObjectOf = (call: TS.CallExpression) =>
    call.arguments.find(
      (arg): arg is TS.ObjectLiteralExpression =>
        ts.isObjectLiteralExpression(arg) && arg.properties.some((property) => ast.propertyName(property) === "guards"),
    );

  const chainOf = (initializer: TS.Expression) => {
    let root = unwrap(initializer);
    const methods: string[] = [];
    while (
      ts.isCallExpression(root) &&
      ts.isPropertyAccessExpression(root.expression) &&
      ts.isCallExpression(unwrap(root.expression.expression))
    ) {
      methods.push(root.expression.name.text);
      root = unwrap(root.expression.expression);
    }
    return { root: ts.isCallExpression(root) ? root : null, methods };
  };

  const keyName = (property: TS.ObjectLiteralElementLike) =>
    ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property) || ts.isShorthandPropertyAssignment(property)
      ? property.name
      : null;

  const objectKeys = (source: TS.SourceFile, object: TS.ObjectLiteralExpression | null | undefined) =>
    (object?.properties ?? []).flatMap((property): NamedFact[] => {
      const name = ast.propertyName(property);
      const node = keyName(property);
      return name && node ? [{ name, span: spanOf(source, node) }] : [];
    });

  const sliceKeysOf = (source: TS.SourceFile, builder: TS.ArrowFunction | TS.FunctionExpression | undefined) =>
    (returnedObject(builder)?.properties ?? []).flatMap((property): SliceKeyFact[] => {
      if (!ts.isPropertyAssignment(property)) return [];
      const name = ast.nodeName(property.name);
      if (!name) return [];
      const { root, methods } = chainOf(property.initializer);
      return [
        {
          name,
          span: spanOf(source, property.name),
          extent: extentOf(source, property),
          guards: root ? guardsIn(optionObjectOf(root)) : [],
          live: methods.includes("live"),
          argCount: methods.filter((method) => argMethods.has(method)).length,
        },
      ];
    });

  const verbReaderOf = (parameter: TS.ParameterDeclaration | undefined) => {
    const verbs = new Map<string, string>();
    if (parameter && ts.isObjectBindingPattern(parameter.name))
      for (const element of parameter.name.elements) {
        const verb = element.propertyName ?? element.name;
        if (ts.isIdentifier(verb) && ts.isIdentifier(element.name)) verbs.set(element.name.text, verb.text);
      }
    const holder = parameter && ts.isIdentifier(parameter.name) ? parameter.name.text : null;
    return (callee: TS.Expression | undefined) => {
      if (callee && ts.isIdentifier(callee)) return verbs.get(callee.text) ?? null;
      if (
        callee &&
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === holder
      )
        return callee.name.text;
      return null;
    };
  };

  const endpointKeysOf = (source: TS.SourceFile, builder: TS.ArrowFunction | TS.FunctionExpression | undefined) => {
    const verbOf = verbReaderOf(builder?.parameters[0]);
    return (returnedObject(builder)?.properties ?? []).flatMap((property): EndpointKeyFact[] => {
      if (!ts.isPropertyAssignment(property)) return [];
      const name = ast.nodeName(property.name);
      if (!name) return [];
      const { root, methods } = chainOf(property.initializer);
      return [
        {
          name,
          span: spanOf(source, property.name),
          extent: extentOf(source, property),
          verb: root ? verbOf(root.expression) : null,
          guards: root ? guardsIn(optionObjectOf(root)) : [],
          argCount: methods.filter((method) => argMethods.has(method)).length,
        },
      ];
    });
  };

  const filterQueriesOf = (source: TS.SourceFile, builder: TS.ArrowFunction | TS.FunctionExpression | undefined) => {
    const query = returnedObject(builder)?.properties.find(
      (property): property is TS.PropertyAssignment =>
        ts.isPropertyAssignment(property) && ast.nodeName(property.name) === "query",
    )?.initializer;
    return query && ts.isObjectLiteralExpression(query) ? objectKeys(source, query) : [];
  };

  const typeOf = (expression: TS.Expression | undefined): { type: string | null; array: boolean } => {
    const value = expression && unwrap(expression);
    if (value && ts.isArrayLiteralExpression(value)) return { type: typeOf(value.elements[0]).type, array: true };
    return { type: value ? ast.expressionName(value) : null, array: false };
  };

  const fieldsOf = (source: TS.SourceFile, object: TS.ObjectLiteralExpression | null) =>
    (object?.properties ?? []).flatMap((property): FieldFact[] => {
      const name = ast.propertyName(property);
      const node = keyName(property);
      if (!name || !node) return [];
      const { root, methods } = ts.isPropertyAssignment(property)
        ? chainOf(property.initializer)
        : { root: null, methods: [] };
      return [
        { name, span: spanOf(source, node), ...typeOf(root?.arguments[0]), optional: methods.includes("optional") },
      ];
    });

  const constantOf = (source: TS.SourceFile, name: NamedFact, call: TS.CallExpression): ConstantClassFact => {
    const parents = call.arguments
      .map(unwrap)
      .filter((arg) => ts.isIdentifier(arg) || ts.isPropertyAccessExpression(arg))
      .map((arg) => ast.expressionName(arg))
      .filter((parent) => parent !== null);
    const fields = call.arguments.flatMap((arg) => fieldsOf(source, ast.firstObjectReturnedByArrow(arg)));
    return { ...name, parents, fields };
  };

  const enumValuesOf = (call: TS.CallExpression) => {
    const list = call.arguments[1] && unwrap(call.arguments[1]);
    if (!list || !ts.isArrayLiteralExpression(list)) return [];
    return list.elements.flatMap((element) => (ts.isStringLiteralLike(element) ? [element.text] : []));
  };

  const methodsOf = (source: TS.SourceFile, statement: TS.ClassDeclaration) =>
    statement.members.flatMap((member): MemberFact[] => {
      if (!ts.isMethodDeclaration(member) || !member.body) return [];
      const name = ast.nodeName(member.name);
      if (!name || ts.getModifiers(member)?.some(({ kind }) => kind === ts.SyntaxKind.StaticKeyword)) return [];
      return [{ name, span: spanOf(source, member.name), extent: extentOf(source, member) }];
    });

  const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

  const read = (source: TS.SourceFile, owner: string | null): FileFacts => {
    const facts: FileFacts = {
      fileName: source.fileName,
      owner,
      constants: [],
      enums: [],
      filters: [],
      models: [],
      services: [],
      slices: [],
      endpoints: [],
      stores: [],
    };
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;
      const heritage = ast.heritageCallNamed(statement, moduleCallees);
      if (!heritage) continue;
      const { callee, call } = heritage;
      const name: NamedFact = { name: statement.name.text, span: spanOf(source, statement.name) };
      const builder = builderOf(call);
      if (callee === "via") facts.constants.push(constantOf(source, name, call));
      else if (callee === "enumOf") facts.enums.push({ ...name, values: enumValuesOf(call) });
      else if (callee === "from") facts.filters.push({ ...name, queries: filterQueriesOf(source, builder) });
      else if (callee === "into")
        facts.models.push({ ...name, model: name.name.endsWith("Model") ? lowerFirst(name.name.slice(0, -5)) : null });
      else if (callee === "serve")
        facts.services.push({
          ...name,
          model: moduleRefOf(call.arguments[0], "db"),
          methods: methodsOf(source, statement),
        });
      else if (callee === "slice")
        facts.slices.push({
          ...name,
          model: moduleRefOf(call.arguments[0], "srv"),
          guards: guardsIn(call.arguments.find(ts.isObjectLiteralExpression)),
          keys: sliceKeysOf(source, builder),
        });
      else if (callee === "endpoint")
        facts.endpoints.push({
          ...name,
          model: moduleRefOf(call.arguments[0], "srv"),
          keys: endpointKeysOf(source, builder),
        });
      else if (callee === "store")
        facts.stores.push({
          ...name,
          model: moduleRefOf(call.arguments[0], "sig"),
          stateKeys: objectKeys(source, returnedObject(builder)),
          actions: methodsOf(source, statement),
        });
    }
    return facts;
  };

  return { read, spanOf, moduleRefOf, chainOf, unwrap };
};

export type AkanFactReader = ReturnType<typeof createFactReader>;

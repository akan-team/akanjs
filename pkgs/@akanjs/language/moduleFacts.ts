import type * as TS from "typescript";
import type { AkanAst, Ts } from "./ast";
import {
  createGuardFactReader,
  type GuardCallFact,
  type GuardFact,
  type GuardFactoryFact,
  type InPlaceGuard,
} from "./guardFacts";

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
  extent: Extent;
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
  queries: MemberFact[];
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

export interface PlugFact extends NamedFact {
  target: string;
}

export interface ServiceClassFact extends ModuleClassFact {
  methods: MemberFact[];
  plugs: PlugFact[];
  fields: string[];
}

export interface InternalKeyFact extends MemberFact {
  type: string | null;
  schedule: string | null;
  modes: string[];
}

export interface InternalClassFact extends ModuleClassFact {
  keys: InternalKeyFact[];
}

export interface AdaptorFact extends MemberFact {
  refName: string | null;
  plugs: PlugFact[];
  doc: string | null;
}

export interface AdaptorBindingFact {
  role: string;
  adaptor: string;
  span: AkanSpan;
}

export interface StoreClassFact extends ModuleClassFact {
  stateKeys: NamedFact[];
  actions: MemberFact[];
}

export interface ImportFact {
  name: string;
  imported: string;
  from: string;
}

export interface FileFacts {
  fileName: string;
  owner: string | null;
  imports: ImportFact[];
  guards: GuardFact[];
  guardFactories: GuardFactoryFact[];
  guardCalls: GuardCallFact[];
  guardLabels: Record<string, string>;
  constants: ConstantClassFact[];
  enums: EnumClassFact[];
  filters: FilterClassFact[];
  models: ModuleClassFact[];
  services: ServiceClassFact[];
  slices: SliceClassFact[];
  endpoints: EndpointClassFact[];
  internals: InternalClassFact[];
  adaptors: AdaptorFact[];
  adaptorBindings: AdaptorBindingFact[];
  stores: StoreClassFact[];
}

export const testFilePattern = /\.(?:test|spec)\.tsx?$/;
const moduleCallees = new Set([
  "via",
  "from",
  "into",
  "serve",
  "slice",
  "endpoint",
  "internal",
  "store",
  "enumOf",
  "adapt",
  "dangerouslyAdapt",
]);
const intervalUnits = [
  [86_400_000, "d"],
  [3_600_000, "h"],
  [60_000, "m"],
  [1000, "s"],
] as const;
const argMethods = new Set(["param", "body", "search", "room", "msg"]);

export const ownerOf = (relativePath: string) => {
  const [root, name] = relativePath.split("/");
  return (root === "apps" || root === "libs") && name ? `${root}/${name}` : null;
};

const syntaxReaderOf = (ts: Ts, ast: AkanAst) => {
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

  const guardNameOf = (expression: TS.Expression) => {
    const value = unwrap(expression);
    return ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression)
      ? `${value.expression.text}.${value.name.text}`
      : ast.expressionName(value);
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
    (object?.properties ?? []).flatMap((property): MemberFact[] => {
      const name = ast.propertyName(property);
      const node = keyName(property);
      return name && node ? [{ name, span: spanOf(source, node), extent: extentOf(source, property) }] : [];
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

  return {
    spanOf,
    extentOf,
    unwrap,
    moduleRefOf,
    returnedObject,
    builderOf,
    guardNameOf,
    optionObjectOf,
    chainOf,
    keyName,
    objectKeys,
    verbReaderOf,
  };
};

type SyntaxReader = ReturnType<typeof syntaxReaderOf>;

const sourceReaderOf = (ts: Ts) => {
  const importsOf = (statement: TS.ImportDeclaration): ImportFact[] => {
    const { importClause, moduleSpecifier } = statement;
    if (!importClause || !ts.isStringLiteral(moduleSpecifier)) return [];
    const from = moduleSpecifier.text;
    const bindings = importClause.namedBindings;
    return [
      ...(importClause.name ? [{ name: importClause.name.text, imported: "default", from }] : []),
      ...(bindings && ts.isNamespaceImport(bindings) ? [{ name: bindings.name.text, imported: "*", from }] : []),
      ...(bindings && ts.isNamedImports(bindings)
        ? bindings.elements.map((element) => ({
            name: element.name.text,
            imported: (element.propertyName ?? element.name).text,
            from,
          }))
        : []),
    ];
  };

  const docOf = (source: TS.SourceFile, node: TS.Node) => {
    const { text } = source;
    const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
    const comments: string[] = [];
    let end = node.getStart(source);
    for (const range of [...ranges].reverse()) {
      if ((text.slice(range.end, end).match(/\n/g)?.length ?? 0) > 1) break;
      comments.unshift(text.slice(range.pos, range.end));
      end = range.pos;
    }
    const lines = comments
      .flatMap((comment) => comment.split("\n"))
      .map((line) =>
        line
          .trim()
          .replace(/^\/\*\*?|\*\/$/g, "")
          .replace(/^(?:\/\/[?*!]?|\*)/, "")
          .replace(/\{@link\s+([^}\s|]+)[^}]*\}/g, "$1")
          .trim(),
      )
      .filter((line) => line && !/^(?:biome-ignore|eslint-|@ts-)/.test(line));
    return lines.length ? lines.join(" ") : null;
  };

  const importsIn = (source: TS.SourceFile) => source.statements.filter(ts.isImportDeclaration).flatMap(importsOf);

  return { docOf, importsIn };
};

const signalKeyReaderOf = (
  ts: Ts,
  ast: AkanAst,
  { spanOf, extentOf, returnedObject, optionObjectOf, chainOf, verbReaderOf }: SyntaxReader,
  guardsIn: ReturnType<typeof createGuardFactReader>["guardsIn"],
) => {
  const sliceKeysOf = (
    source: TS.SourceFile,
    builder: TS.ArrowFunction | TS.FunctionExpression | undefined,
    made: InPlaceGuard[],
    model: string,
  ) =>
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
          guards: root ? guardsIn(source, optionObjectOf(root), made, `${model}.${name}`) : [],
          live: methods.includes("live"),
          argCount: methods.filter((method) => argMethods.has(method)).length,
        },
      ];
    });

  const endpointKeysOf = (
    source: TS.SourceFile,
    builder: TS.ArrowFunction | TS.FunctionExpression | undefined,
    made: InPlaceGuard[],
    model: string,
  ) => {
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
          guards: root ? guardsIn(source, optionObjectOf(root), made, `${model}.${name}`) : [],
          argCount: methods.filter((method) => argMethods.has(method)).length,
        },
      ];
    });
  };

  return { sliceKeysOf, endpointKeysOf };
};

const jobKeyReaderOf = (
  ts: Ts,
  ast: AkanAst,
  { spanOf, extentOf, unwrap, returnedObject, chainOf, verbReaderOf }: SyntaxReader,
) => {
  const numberOf = (expression: TS.Expression): number | null => {
    const value = unwrap(expression);
    if (ts.isNumericLiteral(value)) return Number(value.text.replace(/_/g, ""));
    if (!ts.isBinaryExpression(value)) return null;
    const [left, right] = [numberOf(value.left), numberOf(value.right)];
    if (left === null || right === null) return null;
    const operator = value.operatorToken.kind;
    if (operator === ts.SyntaxKind.AsteriskToken) return left * right;
    if (operator === ts.SyntaxKind.PlusToken) return left + right;
    if (operator === ts.SyntaxKind.MinusToken) return left - right;
    return operator === ts.SyntaxKind.SlashToken && right ? left / right : null;
  };

  const durationOf = (expression: TS.Expression | undefined, source: TS.SourceFile) => {
    if (!expression) return null;
    const ms = numberOf(expression);
    if (ms === null) return expression.getText(source);
    const [size, unit] = intervalUnits.find(([size]) => ms >= size && ms % size === 0) ?? [1, "ms"];
    return `${ms / size}${unit}`;
  };

  //? Only an init job reads `once`, and only an interval job `lock`: `Bun.cron` never overlaps a cron job anyway.
  const modesOf = (option: TS.Expression | undefined, type: string | null) => {
    const object = option && unwrap(option);
    if (!object || !ts.isObjectLiteralExpression(object)) return [];
    return object.properties.filter(ts.isPropertyAssignment).flatMap((property) => {
      const name = ast.nodeName(property.name);
      const value = unwrap(property.initializer);
      if (name === "enabled") return value.kind === ts.SyntaxKind.FalseKeyword ? ["disabled"] : [];
      if (name === "once") return type === "initialize" && value.kind === ts.SyntaxKind.TrueKeyword ? ["once"] : [];
      if (name === "lock") return type === "interval" && value.kind === ts.SyntaxKind.FalseKeyword ? ["unlocked"] : [];
      if (name !== "serverMode" && name !== "operationMode") return [];
      const values = ts.isArrayLiteralExpression(value) ? [...value.elements] : [value];
      return values.flatMap((element) =>
        ts.isStringLiteralLike(element)
          ? [element.text]
          : ts.isPropertyAccessExpression(element)
            ? [element.name.text]
            : [],
      );
    });
  };

  const internalKeysOf = (source: TS.SourceFile, builder: TS.ArrowFunction | TS.FunctionExpression | undefined) => {
    const verbOf = verbReaderOf(builder?.parameters[0]);
    return (returnedObject(builder)?.properties ?? []).flatMap((property): InternalKeyFact[] => {
      if (!ts.isPropertyAssignment(property)) return [];
      const name = ast.nodeName(property.name);
      if (!name) return [];
      const { root } = chainOf(property.initializer);
      const type = root ? verbOf(root.expression) : null;
      const [first, second] = root?.arguments ?? [];
      const cron = type === "cron" && first ? unwrap(first) : null;
      const schedule = cron
        ? ts.isStringLiteralLike(cron)
          ? cron.text
          : cron.getText(source)
        : type === "interval" || type === "timeout"
          ? durationOf(first, source)
          : null;
      const option = type === "initialize" || type === "destroy" ? first : second;
      return [
        {
          name,
          span: spanOf(source, property.name),
          extent: extentOf(source, property),
          type,
          schedule,
          modes: modesOf(option, type),
        },
      ];
    });
  };

  return { internalKeysOf };
};

const serviceReaderOf = (
  ts: Ts,
  ast: AkanAst,
  { spanOf, extentOf, returnedObject, guardNameOf, chainOf, verbReaderOf }: SyntaxReader,
) => {
  const plugsOf = (source: TS.SourceFile, builder: TS.ArrowFunction | TS.FunctionExpression | undefined) => {
    const verbOf = verbReaderOf(builder?.parameters[0]);
    return (returnedObject(builder)?.properties ?? []).flatMap((property): PlugFact[] => {
      if (!ts.isPropertyAssignment(property)) return [];
      const name = ast.nodeName(property.name);
      const { root } = chainOf(property.initializer);
      const [target] = root && verbOf(root.expression) === "plug" ? root.arguments : [];
      const targetName = target && guardNameOf(target);
      return name && targetName ? [{ name, span: spanOf(source, property.name), target: targetName }] : [];
    });
  };

  const adaptorBindingsIn = (source: TS.SourceFile) => {
    const bindings: AdaptorBindingFact[] = [];
    const visit = (node: TS.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "applyAdaptor"
      ) {
        const [role, adaptor] = node.arguments.map(guardNameOf);
        if (role && adaptor) bindings.push({ role, adaptor, span: spanOf(source, node.expression.name) });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return bindings;
  };

  const methodsOf = (source: TS.SourceFile, statement: TS.ClassDeclaration) =>
    statement.members.flatMap((member): MemberFact[] => {
      if (!ts.isMethodDeclaration(member) || !member.body) return [];
      const name = ast.nodeName(member.name);
      if (!name || ts.getModifiers(member)?.some(({ kind }) => kind === ts.SyntaxKind.StaticKeyword)) return [];
      return [{ name, span: spanOf(source, member.name), extent: extentOf(source, member) }];
    });

  return { plugsOf, adaptorBindingsIn, methodsOf };
};

const constantReaderOf = (
  ts: Ts,
  ast: AkanAst,
  { spanOf, extentOf, unwrap, returnedObject, chainOf, keyName, objectKeys }: SyntaxReader,
) => {
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
        {
          name,
          span: spanOf(source, node),
          extent: extentOf(source, property),
          ...typeOf(root?.arguments[0]),
          optional: methods.includes("optional"),
        },
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

  return { constantOf, enumValuesOf, filterQueriesOf };
};

export const createFactReader = (ts: Ts, ast: AkanAst) => {
  const syntax = syntaxReaderOf(ts, ast);
  const { spanOf, extentOf, unwrap, moduleRefOf, returnedObject, builderOf, chainOf, objectKeys } = syntax;
  const { docOf, importsIn } = sourceReaderOf(ts);
  const { guardsIn, guardsOf } = createGuardFactReader(ts, ast, { spanOf, extentOf, unwrap, docOf });
  const { sliceKeysOf, endpointKeysOf } = signalKeyReaderOf(ts, ast, syntax, guardsIn);
  const { internalKeysOf } = jobKeyReaderOf(ts, ast, syntax);
  const { plugsOf, adaptorBindingsIn, methodsOf } = serviceReaderOf(ts, ast, syntax);
  const { constantOf, enumValuesOf, filterQueriesOf } = constantReaderOf(ts, ast, syntax);

  const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

  const read = (source: TS.SourceFile, owner: string | null): FileFacts => {
    const imports = importsIn(source);
    const madeInPlace: InPlaceGuard[] = [];
    const facts: FileFacts = {
      fileName: source.fileName,
      owner,
      imports,
      guards: [],
      guardFactories: [],
      guardCalls: [],
      guardLabels: {},
      constants: [],
      enums: [],
      filters: [],
      models: [],
      services: [],
      slices: [],
      endpoints: [],
      internals: [],
      adaptors: [],
      adaptorBindings: source.text.includes("applyAdaptor") ? adaptorBindingsIn(source) : [],
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
          plugs: plugsOf(source, builder),
          fields: objectKeys(source, returnedObject(builder)).map(({ name }) => name),
        });
      else if (callee === "slice") {
        const model = moduleRefOf(call.arguments[0], "srv");
        const member = model ?? name.name;
        facts.slices.push({
          ...name,
          model,
          guards: guardsIn(source, call.arguments.find(ts.isObjectLiteralExpression), madeInPlace, member),
          keys: sliceKeysOf(source, builder, madeInPlace, member),
        });
      } else if (callee === "internal")
        facts.internals.push({
          ...name,
          model: moduleRefOf(call.arguments[0], "srv"),
          keys: internalKeysOf(source, builder),
        });
      else if (callee === "adapt" || callee === "dangerouslyAdapt") {
        const refName = call.arguments[0] && unwrap(call.arguments[0]);
        facts.adaptors.push({
          ...name,
          extent: extentOf(source, statement),
          refName: refName && ts.isStringLiteralLike(refName) ? refName.text : null,
          plugs: plugsOf(source, builder),
          doc: docOf(source, statement),
        });
      } else if (callee === "endpoint") {
        const model = moduleRefOf(call.arguments[0], "srv");
        facts.endpoints.push({
          ...name,
          model,
          keys: endpointKeysOf(source, builder, madeInPlace, model ?? name.name),
        });
      } else if (callee === "store")
        facts.stores.push({
          ...name,
          model: moduleRefOf(call.arguments[0], "sig"),
          stateKeys: objectKeys(source, returnedObject(builder)),
          actions: methodsOf(source, statement),
        });
    }
    return { ...facts, ...guardsOf(source, imports, madeInPlace) };
  };

  return { read, spanOf, extentOf, docOf, importsIn, moduleRefOf, chainOf, unwrap };
};

export type AkanFactReader = ReturnType<typeof createFactReader>;

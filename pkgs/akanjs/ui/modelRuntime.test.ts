import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = import.meta.dir;
const marker = path.join(root, "modelRuntime");
const testFile = /\.(test|spec)\.tsx?$|\.fixture\.tsx?$/;

interface Parsed {
  rel: string;
  sf: ts.SourceFile;
}

const strip = (expr: ts.Expression): ts.Expression => {
  let cur = expr;
  while (
    ts.isParenthesizedExpression(cur) ||
    ts.isAsExpression(cur) ||
    ts.isTypeAssertionExpression(cur) ||
    ts.isNonNullExpression(cur) ||
    ts.isSatisfiesExpression(cur)
  )
    cur = cur.expression;
  return cur;
};

const isHandleImport = (spec: string, name: string) =>
  (name === "st" && (spec === "akanjs/store" || /(^|\/)store(\/[\w.]+)?$/.test(spec))) ||
  (name === "fetch" && spec === "akanjs/client");

//? A handle is `st` or `fetch` itself, a static member chain of one, `st.get()` or `fetch.clone()`.
const isHandle = (expr: ts.Expression, handles: Set<string>): boolean => {
  const cur = strip(expr);
  if (ts.isIdentifier(cur)) return handles.has(cur.text);
  if (ts.isPropertyAccessExpression(cur)) return isHandle(cur.expression, handles);
  const callee = ts.isCallExpression(cur) ? strip(cur.expression) : null;
  return (
    !!callee &&
    ts.isPropertyAccessExpression(callee) &&
    ["get", "clone"].includes(callee.name.text) &&
    isHandle(callee.expression, handles)
  );
};

const registryLookups = new Set(["getDatabase", "getScalar", "getModelRef", "getOrigin"]);
const registryMaps = new Set(["database", "scalar", "enum", "value", "origin"]);

const registriesOf = (parsed: Parsed) =>
  new Set(
    importsOf(parsed)
      .filter((stmt) => stmt.moduleSpecifier.text === "akanjs/constant" && !stmt.importClause?.isTypeOnly)
      .flatMap((stmt) => {
        const bindings = stmt.importClause?.namedBindings;
        return bindings && ts.isNamedImports(bindings) ? [...bindings.elements] : [];
      })
      .filter((el) => !el.isTypeOnly && (el.propertyName ?? el.name).text === "ConstantRegistry")
      .map((el) => el.name.text),
  );

const isFetchProxyType = (type: ts.TypeNode | undefined) =>
  !!type && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === "FetchProxy";

const parse = (rel: string, text = readFileSync(path.join(root, rel), "utf8")): Parsed => ({
  rel,
  sf: ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
});

const importsOf = ({ sf }: Parsed) =>
  sf.statements.filter(
    (stmt): stmt is ts.ImportDeclaration & { moduleSpecifier: ts.StringLiteral } =>
      ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier),
  );

const handlesOf = (parsed: Parsed, aliases: Map<string, Set<string>>) => {
  const handles = new Set<string>();
  for (const stmt of importsOf(parsed)) {
    const clause = stmt.importClause;
    if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    const spec = stmt.moduleSpecifier.text;
    const target = spec.startsWith(".") ? path.join(path.dirname(parsed.rel), spec) : null;
    for (const el of clause.namedBindings.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (!el.isTypeOnly && (isHandleImport(spec, imported) || (target && aliases.get(target)?.has(imported))))
        handles.add(el.name.text);
    }
  }
  for (let size = -1; size !== handles.size; ) {
    size = handles.size;
    const visit = (node: ts.Node) => {
      const derived =
        (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) &&
        ts.isIdentifier(node.name) &&
        ((node.initializer && isHandle(node.initializer, handles)) ||
          (!ts.isBindingElement(node) && isFetchProxyType(node.type)));
      if (derived) handles.add((node.name as ts.Identifier).text);
      ts.forEachChild(node, visit);
    };
    visit(parsed.sf);
  }
  return handles;
};

const handoffTypes = new Set([
  "SliceMeta",
  "ServerInit",
  "ClientInit",
  "ServerView",
  "ClientView",
  "ServerEdit",
  "ClientEdit",
]);
//? The names a handoff carries; anything else on it is the model's data, and a key read from data follows a relation.
const handoffNameKeys = new Set(["refName", "sliceName", "argLength"]);
const nameFunctions = new Map([
  ["akanjs/common", new Set(["lowerlize", "capitalize", "modelNames", "sliceNames", "stateSetterName"])],
  ["sliceNamesOf", new Set(["sliceNamesOf"])],
]);

type Taint = "handoff" | "name" | "const" | null;

//? Which values of a file can only name the model of a handoff object it was given (`slice`, `init`, `view`, `edit`):
//? the server attaches that model's client reference to each, so the model's runtime has loaded where one arrives.
//? A name counts only when every declaration of it in the file does, so a shadowing one cannot borrow the verdict.
class HandoffNames {
  readonly #declarations = new Map<string, (() => Taint)[]>();
  readonly #taints = new Map<string, Taint>();
  readonly #props = new Map<string, { own: Map<string, boolean>; bases: string[] }>();
  readonly #handoffTypeNames = new Set<string>();
  readonly #nameFunctions = new Set<string>();
  readonly #storeHelpers = new Set<string>();
  readonly #storeFacades = new Set<string>();
  readonly #memoHooks = new Set<string>();

  constructor(parsed: Parsed) {
    for (const stmt of importsOf(parsed)) this.#readImport(stmt);
    this.#collect(parsed.sf);
    for (let changed = true; changed; ) {
      changed = false;
      for (const [name, declarations] of this.#declarations) {
        const taints = declarations.map((taintOf) => taintOf());
        const [first] = taints;
        const taint = first && taints.every((each) => each === first) ? first : null;
        if (taint && this.#taints.get(name) !== taint) {
          this.#taints.set(name, taint);
          changed = true;
        }
      }
    }
  }

  #readImport(stmt: ts.ImportDeclaration & { moduleSpecifier: ts.StringLiteral }) {
    const bindings = stmt.importClause?.namedBindings;
    const spec = stmt.moduleSpecifier.text;
    const defaultName = stmt.importClause?.name?.text;
    if (defaultName) this.#declare(defaultName, () => null);
    if (!bindings) return;
    if (!ts.isNamedImports(bindings)) return this.#declare(bindings.name.text, () => null);
    const functions = nameFunctions.get(spec) ?? nameFunctions.get(path.basename(spec));
    for (const el of bindings.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (spec === "akanjs/fetch" && handoffTypes.has(imported)) this.#handoffTypeNames.add(el.name.text);
      else if (functions?.has(imported)) this.#nameFunctions.add(el.name.text);
      else if (spec === "react" && imported === "useMemo") this.#memoHooks.add(el.name.text);
      else if (imported === "StoreFacade" && /(^|\/)store(\/|$)/.test(spec)) this.#storeFacades.add(el.name.text);
      else if (spec.startsWith(".") && /\/store\//.test(spec)) this.#storeHelpers.add(el.name.text);
      this.#declare(el.name.text, () => null);
    }
  }

  #declare(name: string, taintOf: () => Taint) {
    this.#declarations.set(name, [...(this.#declarations.get(name) ?? []), taintOf]);
  }

  #isHandoffType(type: ts.TypeNode | undefined): boolean {
    if (!type) return false;
    if (ts.isParenthesizedTypeNode(type)) return this.#isHandoffType(type.type);
    if (ts.isUnionTypeNode(type)) {
      const members = type.types.filter(
        (member) => member.kind !== ts.SyntaxKind.UndefinedKeyword && !ts.isLiteralTypeNode(member),
      );
      return members.length > 0 && members.every((member) => this.#isHandoffType(member));
    }
    if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return false;
    const [picked] = type.typeName.text === "Pick" ? (type.typeArguments ?? []) : [];
    return picked ? this.#isHandoffType(picked) : this.#handoffTypeNames.has(type.typeName.text);
  }

  #membersOf(members: ts.NodeArray<ts.TypeElement>) {
    return new Map(
      members.flatMap((member): [string, boolean][] =>
        ts.isPropertySignature(member) && ts.isIdentifier(member.name)
          ? [[member.name.text, this.#isHandoffType(member.type)]]
          : [],
      ),
    );
  }

  #propIsHandoff(type: ts.TypeNode | undefined, key: string, seen = new Set<string>()): boolean {
    if (!type) return false;
    if (ts.isTypeLiteralNode(type)) return this.#membersOf(type.members).get(key) === true;
    if (ts.isIntersectionTypeNode(type)) return type.types.some((member) => this.#propIsHandoff(member, key, seen));
    if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return false;
    return this.#namedPropIsHandoff(type.typeName.text, key, seen);
  }

  #namedPropIsHandoff(name: string, key: string, seen: Set<string>): boolean {
    const props = this.#props.get(name);
    if (!props || seen.has(name)) return false;
    seen.add(name);
    const own = props.own.get(key);
    return own ?? props.bases.some((base) => this.#namedPropIsHandoff(base, key, seen));
  }

  #collect(node: ts.Node) {
    if (ts.isInterfaceDeclaration(node))
      this.#props.set(node.name.text, {
        own: this.#membersOf(node.members),
        bases: (node.heritageClauses ?? []).flatMap((clause) =>
          clause.types.flatMap((type) => (ts.isIdentifier(type.expression) ? [type.expression.text] : [])),
        ),
      });
    if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type))
      this.#props.set(node.name.text, { own: this.#membersOf(node.type.members), bases: [] });
    if (ts.isFunctionDeclaration(node) && node.name) this.#declare(node.name.text, () => null);
    if (ts.isClassDeclaration(node) && node.name) this.#declare(node.name.text, () => null);
    if (ts.isParameter(node)) this.#collectParameter(node);
    if (ts.isVariableDeclaration(node)) {
      const { initializer } = node;
      this.#bind(node.name, initializer ? () => this.taintOf(initializer) : () => null);
    }
    if (
      ts.isPropertyDeclaration(node) &&
      node.initializer &&
      (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name))
    ) {
      const { initializer } = node;
      this.#declare(`this.${node.name.text}`, () => this.taintOf(initializer));
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      const plain = node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      const target = this.#nameOf(node.left);
      if (target) this.#declare(target, plain ? () => this.taintOf(node.right) : () => null);
    }
    ts.forEachChild(node, (child) => this.#collect(child));
  }

  #collectParameter(node: ts.ParameterDeclaration) {
    const handoff = this.#isHandoffType(node.type) && !node.initializer;
    if (ts.isIdentifier(node.name)) {
      this.#declare(node.name.text, () => (handoff ? "handoff" : null));
      if (ts.isConstructorDeclaration(node.parent) && node.modifiers?.length)
        this.#declare(`this.${node.name.text}`, () => (handoff ? "handoff" : null));
      return;
    }
    if (!ts.isObjectBindingPattern(node.name)) return this.#bind(node.name, () => null);
    for (const el of node.name.elements) {
      const key = el.propertyName ?? el.name;
      const typed =
        ts.isIdentifier(key) && !el.initializer && !el.dotDotDotToken && this.#propIsHandoff(node.type, key.text);
      this.#bind(el.name, () => (typed && ts.isIdentifier(el.name) ? "handoff" : null));
    }
  }

  #bind(name: ts.BindingName, taintOf: () => Taint) {
    if (ts.isIdentifier(name)) return this.#declare(name.text, taintOf);
    for (const el of name.elements) {
      if (ts.isOmittedExpression(el)) continue;
      const key = el.propertyName ?? el.name;
      const picks = ts.isIdentifier(key) && !el.dotDotDotToken && !el.initializer;
      const keyed = ts.isObjectBindingPattern(name);
      this.#bind(el.name, () => {
        const from = picks ? taintOf() : null;
        if (from === "handoff") return keyed && handoffNameKeys.has((key as ts.Identifier).text) ? "name" : null;
        return from === "name" ? "name" : null;
      });
    }
  }

  #nameOf(expr: ts.Expression): string | null {
    const cur = strip(expr);
    if (ts.isIdentifier(cur)) return cur.text;
    const onThis = ts.isPropertyAccessExpression(cur) && cur.expression.kind === ts.SyntaxKind.ThisKeyword;
    return onThis ? `this.${cur.name.text}` : null;
  }

  taintOf(expr: ts.Expression): Taint {
    const cur = strip(expr);
    if (ts.isStringLiteralLike(cur) || ts.isNumericLiteral(cur)) return "const";
    const named = this.#nameOf(cur);
    if (named) return this.#taints.get(named) ?? null;
    const names = (parts: ts.Expression[]): Taint => {
      const taints = parts.map((part) => this.taintOf(part));
      if (!taints.every((taint) => taint === "name" || taint === "const")) return null;
      return taints.includes("name") ? "name" : "const";
    };
    if (ts.isPropertyAccessExpression(cur)) {
      const from = this.taintOf(cur.expression);
      if (from === "handoff") return handoffNameKeys.has(cur.name.text) ? "name" : null;
      return from === "name" ? "name" : null;
    }
    if (ts.isElementAccessExpression(cur))
      return this.taintOf(cur.expression) === "name" ? names([cur.argumentExpression]) : null;
    if (ts.isTemplateExpression(cur)) return names(cur.templateSpans.map((span) => span.expression));
    if (ts.isBinaryExpression(cur) && cur.operatorToken.kind === ts.SyntaxKind.PlusToken)
      return names([cur.left, cur.right]);
    if (ts.isConditionalExpression(cur)) return names([cur.whenTrue, cur.whenFalse]);
    if (ts.isArrowFunction(cur) && cur.parameters.length === 0 && !ts.isBlock(cur.body)) return names([cur.body]);
    if (ts.isArrayLiteralExpression(cur)) return names([...cur.elements]);
    if (ts.isObjectLiteralExpression(cur))
      return cur.properties.every((prop) => ts.isPropertyAssignment(prop) && !ts.isComputedPropertyName(prop.name))
        ? names(cur.properties.map((prop) => (prop as ts.PropertyAssignment).initializer))
        : null;
    if (!ts.isCallExpression(cur)) return null;
    const callee = strip(cur.expression);
    if (ts.isIdentifier(callee) && this.#nameFunctions.has(callee.text)) return names([...cur.arguments]);
    if (ts.isIdentifier(callee) && this.#memoHooks.has(callee.text)) return names(cur.arguments.slice(0, 1));
    const replaces = ts.isPropertyAccessExpression(callee) && callee.name.text === "replace";
    return replaces ? names([callee.expression, ...cur.arguments]) : null;
  }

  named(expr: ts.Expression) {
    return this.taintOf(expr) === "name";
  }

  //? An object written into the store names a model only through its computed keys; the values are the data.
  namesOrKeys(expr: ts.Expression) {
    const cur = strip(expr);
    if (!ts.isObjectLiteralExpression(cur)) return ["name", "const"].includes(this.taintOf(cur) ?? "");
    return cur.properties.every(
      (prop) =>
        !ts.isSpreadAssignment(prop) &&
        (!prop.name || !ts.isComputedPropertyName(prop.name) || this.named(prop.name.expression)),
    );
  }

  isStoreHelper(callee: ts.Expression) {
    const cur = strip(callee);
    return ts.isIdentifier(cur) && this.#storeHelpers.has(cur.text);
  }

  //? `StoreFacade.peek` answers `undefined` for a key no loaded store declares, so its caller asks for no runtime.
  isOptionalLookup(callee: ts.Expression) {
    const cur = strip(callee);
    return (
      ts.isPropertyAccessExpression(cur) &&
      cur.name.text === "peek" &&
      ts.isIdentifier(cur.expression) &&
      this.#storeFacades.has(cur.expression.text)
    );
  }
}

interface Reach {
  line: number;
  //? Its model arrives with a handoff object, whose client reference has loaded that model's runtime.
  handedOver: boolean;
}

//? Where a file names a store key, fetch handler or registered constant at runtime, or passes the handle on whole.
const reachesOf = (parsed: Parsed, handles: Set<string>): Reach[] => {
  const reaches: Reach[] = [];
  const registries = registriesOf(parsed);
  const names = new HandoffNames(parsed);
  const reach = (node: ts.Node, handedOver: boolean) =>
    reaches.push({ line: parsed.sf.getLineAndCharacterOfPosition(node.getStart(parsed.sf)).line + 1, handedOver });
  const isWholeHandle = (expr: ts.Expression) => {
    const bare = strip(expr);
    return ts.isIdentifier(bare) && handles.has(bare.text);
  };
  const isRegistryMember = (expr: ts.Expression, members: Set<string>) => {
    const cur = strip(expr);
    return (
      ts.isPropertyAccessExpression(cur) &&
      members.has(cur.name.text) &&
      ts.isIdentifier(strip(cur.expression)) &&
      registries.has((strip(cur.expression) as ts.Identifier).text)
    );
  };
  const literalOnly = (args: ts.NodeArray<ts.Expression>) => args.every((arg) => ts.isStringLiteralLike(strip(arg)));
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isRegistryMember(node.expression, registryLookups) && !literalOnly(node.arguments))
      reach(
        node,
        node.arguments.every((arg) => ts.isObjectLiteralExpression(strip(arg)) || names.namesOrKeys(arg)),
      );
    if (ts.isPropertyAccessExpression(node) && isRegistryMember(node, registryMaps)) {
      const lookup = ts.isPropertyAccessExpression(node.parent) ? node.parent : null;
      const call = lookup && ts.isCallExpression(lookup.parent) ? lookup.parent : null;
      if (!(call && ["get", "has"].includes(lookup?.name.text ?? "") && literalOnly(call.arguments)))
        reach(node, false);
    }
    if (
      ts.isElementAccessExpression(node) &&
      !ts.isStringLiteralLike(node.argumentExpression) &&
      !ts.isNumericLiteral(node.argumentExpression) &&
      isHandle(node.expression, handles)
    )
      reach(node, names.named(node.argumentExpression));
    if (ts.isCallExpression(node)) {
      const computedKey = (arg: ts.Expression) =>
        ts.isObjectLiteralExpression(arg) && arg.properties.some((p) => p.name && ts.isComputedPropertyName(p.name));
      if (isHandle(node.expression, handles) && node.arguments.some(computedKey))
        reach(
          node,
          node.arguments.filter(computedKey).every((arg) => names.namesOrKeys(arg)),
        );
      if (node.arguments.some(isWholeHandle) && !names.isOptionalLookup(node.expression)) {
        const others = node.arguments.filter((arg) => !isWholeHandle(arg));
        reach(
          node,
          names.isStoreHelper(node.expression) &&
            others.some((arg) => names.named(arg)) &&
            others.every((arg) => names.namesOrKeys(arg)),
        );
      }
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)) {
      const value = node.initializer.expression;
      if (value && isWholeHandle(value)) reach(node, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sf);
  return reaches;
};

const reachesByComputedName = (parsed: Parsed, handles: Set<string>) => reachesOf(parsed, handles).length > 0;
//? What only the app's whole runtime answers: a reach whose model no handoff object brought.
const needsWholeRuntime = (parsed: Parsed, handles: Set<string>) =>
  reachesOf(parsed, handles).some(({ handedOver }) => !handedOver);

const exportedAliasesOf = (files: Parsed[]) => {
  const aliases = new Map<string, Set<string>>();
  for (const parsed of files) {
    const handles = handlesOf(parsed, new Map());
    const names = parsed.sf.statements
      .filter(
        (stmt): stmt is ts.VariableStatement =>
          ts.isVariableStatement(stmt) && !!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
      )
      .flatMap((stmt) => stmt.declarationList.declarations)
      .flatMap((decl) => (ts.isIdentifier(decl.name) && handles.has(decl.name.text) ? [decl.name.text] : []));
    if (names.length > 0) aliases.set(parsed.rel.replace(/\.tsx?$/, ""), new Set(names));
  }
  return aliases;
};

const importsMarker = (parsed: Parsed) =>
  importsOf(parsed).some(
    (stmt) =>
      stmt.moduleSpecifier.text.startsWith(".") &&
      path.resolve(root, path.dirname(parsed.rel), stmt.moduleSpecifier.text).replace(/\.ts$/, "") === marker,
  );

const sources = [...new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: root })]
  .filter((rel) => !testFile.test(rel))
  .sort((a, b) => a.localeCompare(b))
  .map((rel) => parse(rel));

describe("akanjs/ui/modelRuntime", () => {
  //? Under `clientRuntime: "route"` a page's chunks load a model's runtime only where a module imports it or a handoff
  //? object brings its client reference; a framework file naming any other model at runtime has the marker bring all.
  test("is imported by exactly the UI files that reach a model no handoff object brought", () => {
    const aliases = exportedAliasesOf(sources);
    const reaching = sources.filter((parsed) => reachesByComputedName(parsed, handlesOf(parsed, aliases)));
    const needing = reaching.filter((parsed) => needsWholeRuntime(parsed, handlesOf(parsed, aliases)));
    const importing = sources.filter(importsMarker);

    expect(reaching.length).toBeGreaterThan(20);
    expect(reaching.length - needing.length).toBeGreaterThan(15);
    expect(importing.map(({ rel }) => rel)).toEqual(needing.map(({ rel }) => rel));
  });

  test("tells a computed store key, a computed fetch handler and a passed-on handle from a literal one", () => {
    const reaches = (text: string) => {
      const parsed = parse("Data/Probe.tsx", text);
      return reachesByComputedName(parsed, handlesOf(parsed, new Map([["Data/handles", new Set(["runtimeFetch"])]])));
    };
    const imports = 'import { fetch } from "akanjs/client";\nimport { st } from "akanjs/store";\n';

    expect(reaches(`${imports}const use = st.use as never;\nexport const a = (k: string) => use[k];`)).toBe(true);
    expect(reaches(`${imports}export const a = (k: string) => (fetch as never)[k];`)).toBe(true);
    expect(reaches(`${imports}export const a = (k: string) => st.set({ [k]: 1 });`)).toBe(true);
    expect(reaches(`${imports}export const A = () => <Child fetch={fetch} />;`)).toBe(true);
    expect(reaches(`import { runtimeFetch } from "./handles";\nexport const a = (k: string) => runtimeFetch[k];`)).toBe(
      true,
    );
    expect(reaches(`${imports}export const a = () => [st.use.me(), fetch.ws.connected, st.do["reset"]];`)).toBe(false);
  });

  test("tells a constant looked up or listed by name from one read off a class in hand", () => {
    const reaches = (body: string) =>
      reachesByComputedName(
        parse("Constant/Probe.ts", `import { ConstantRegistry as R } from "akanjs/constant";\n${body}`),
        new Set(),
      );

    expect(reaches("export const a = (refName: string) => R.getDatabase(refName);")).toBe(true);
    expect(reaches("export const a = (key: string) => R.enum.get(key);")).toBe(true);
    expect(reaches("export const a = () => [...R.scalar.keys()];")).toBe(true);
    expect(
      reaches('export const a = (ref: never) => [R.getModelName(ref), R.getDatabase("user"), R.enum.has("x")];'),
    ).toBe(false);
  });

  const imports = [
    'import { fetch } from "akanjs/client";',
    'import { lowerlize, modelNames } from "akanjs/common";',
    'import { ConstantRegistry } from "akanjs/constant";',
    'import type { ClientView, ServerInit, SliceMeta } from "akanjs/fetch";',
    'import { st } from "akanjs/store";',
    'import { useMemo } from "react";',
    'import { servedEndpointOf } from "../../store/servedEndpointOf";',
    'import { StoreFacade } from "../../store/storeFacade";',
    'import { sliceNamesOf } from "../sliceNamesOf";',
    "const use = st.use as unknown as { [key: string]: () => unknown };",
    "interface Props { slice: SliceMeta; other: string; resets?: string[]; view: ClientView<string, object> }",
  ].join("\n");
  const whole = (body: string) => {
    const parsed = parse("Model/Probe.tsx", `${imports}\n${body}`);
    const handles = handlesOf(parsed, new Map());
    expect(reachesByComputedName(parsed, handles)).toBe(true);
    return needsWholeRuntime(parsed, handles);
  };

  test("takes a key made only of the names a handoff object carries as brought by that object", () => {
    expect(whole("export const A = ({ slice }: Props) => use[modelNames(slice.refName).model]();")).toBe(false);
    expect(
      whole(
        "export const A = ({ slice }: Props) => {\n  const { refName, sliceName } = slice;\n" +
          "  const model = useMemo(() => lowerlize(refName), []);\n" +
          "  const { namesOfSlice } = sliceNamesOf(model, sliceName);\n" +
          "  st.set({ [namesOfSlice.modelList]: [] });\n" +
          `  return [use[\`\${namesOfSlice.modelList}Loading\`](), ConstantRegistry.getDatabase(refName)];\n};`,
      ),
    ).toBe(false);
    expect(whole("export const a = (init: ServerInit<string, object>) => use[modelNames(init.refName).model];")).toBe(
      false,
    );
    expect(whole('export const a = (init: Pick<ServerInit<string, object>, "refName">) => use[init.refName];')).toBe(
      false,
    );
    expect(
      whole("export const A = ({ slice }: Props) => servedEndpointOf(fetch, modelNames(slice.refName).removeModel);"),
    ).toBe(false);
    expect(
      whole(
        "class Claim {\n  readonly names: { model: string };\n" +
          "  constructor(slice: SliceMeta) {\n    this.names = modelNames(slice.refName);\n  }\n" +
          "  read() {\n    return use[this.names.model]();\n  }\n}",
      ),
    ).toBe(false);
  });

  test("leaves to the marker a key from any other prop, from the handed data, or from a name declared twice", () => {
    expect(whole("export const A = ({ other }: Props) => use[modelNames(other).model]();")).toBe(true);
    expect(whole(`export const A = ({ slice, other }: Props) => use[\`\${slice.refName}\${other}\`]();`)).toBe(true);
    expect(whole("export const a = (slice: SliceMeta) => use[(slice as never as { field: string }).field];")).toBe(
      true,
    );
    expect(whole("export const a = (view: ClientView<string, object>) => use[view.refName];")).toBe(false);
    expect(whole("export const A = ({ view }: Props) => use[(view as never as { owner: string }).owner];")).toBe(true);
    expect(whole("export const A = ({ resets }: Props) => resets?.map((reset) => use[modelNames(reset).model]);")).toBe(
      true,
    );
    expect(
      whole(
        "export const A = ({ slice }: Props) => {\n  const { refName } = slice;\n  return use[refName]();\n};\n" +
          "export const b = (refName: string) => use[refName];",
      ),
    ).toBe(true);
    expect(whole('export const a = (slice: SliceMeta = { refName: "x" } as SliceMeta) => use[slice.refName];')).toBe(
      true,
    );
    expect(whole("export const A = ({ slice }: Props) => servedEndpointOf(fetch, slice.sliceName, slice);")).toBe(true);
    expect(whole("export const a = (name: string) => servedEndpointOf(fetch, name);")).toBe(true);
    expect(
      whole(
        "const helper = (handle: unknown, key: string) => key;\nexport const a = (slice: SliceMeta) => helper(fetch, slice.refName);",
      ),
    ).toBe(true);
    expect(whole("export const a = (slice: SliceMeta) => ConstantRegistry.database.get(slice.refName);")).toBe(true);
  });

  test("takes a store key asked for through `StoreFacade.peek` as asking for no runtime", () => {
    const parsed = parse(
      "Model/Probe.ts",
      `${imports}\nexport const a = (resets: string[]) => resets.map((reset) => StoreFacade.peek(st.do, reset));\n` +
        "const act = st.do as unknown as object;\nexport const b = (key: string) => StoreFacade.peek(act, key);",
    );
    expect(reachesByComputedName(parsed, handlesOf(parsed, new Map()))).toBe(false);
  });
});

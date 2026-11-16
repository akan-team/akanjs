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

//? What only the app's whole runtime answers: a key, handler or constant named at runtime, or the handle passed on whole.
const reachesByComputedName = (parsed: Parsed, handles: Set<string>) => {
  let reaches = false;
  const registries = registriesOf(parsed);
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
      reaches = true;
    if (ts.isPropertyAccessExpression(node) && isRegistryMember(node, registryMaps)) {
      const lookup = ts.isPropertyAccessExpression(node.parent) ? node.parent : null;
      const call = lookup && ts.isCallExpression(lookup.parent) ? lookup.parent : null;
      if (!(call && ["get", "has"].includes(lookup?.name.text ?? "") && literalOnly(call.arguments))) reaches = true;
    }
    if (
      ts.isElementAccessExpression(node) &&
      !ts.isStringLiteralLike(node.argumentExpression) &&
      !ts.isNumericLiteral(node.argumentExpression) &&
      isHandle(node.expression, handles)
    )
      reaches = true;
    if (ts.isCallExpression(node)) {
      const computedKey = (arg: ts.Expression) =>
        ts.isObjectLiteralExpression(arg) && arg.properties.some((p) => p.name && ts.isComputedPropertyName(p.name));
      if (isHandle(node.expression, handles) && node.arguments.some(computedKey)) reaches = true;
      if (node.arguments.some(isWholeHandle)) reaches = true;
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)) {
      const value = node.initializer.expression;
      if (value && isWholeHandle(value)) reaches = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sf);
  return reaches;
};

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
  //? Under `clientRuntime: "route"` a page's chunks load a model's runtime only where a module imports it; a framework
  //? file naming a store key, fetch handler or registered constant at runtime cannot, so the marker brings it whole.
  test("is imported by exactly the UI files that reach a model by a computed name", () => {
    const aliases = exportedAliasesOf(sources);
    const reaching = sources.filter((parsed) => reachesByComputedName(parsed, handlesOf(parsed, aliases)));
    const importing = sources.filter(importsMarker);

    expect(reaching.length).toBeGreaterThan(20);
    expect(importing.map(({ rel }) => rel)).toEqual(reaching.map(({ rel }) => rel));
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
});

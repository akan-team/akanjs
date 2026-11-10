import { normalizeRoutePattern, tryParseRouteModuleKey } from "akanjs/common/routeConvention.ts";
import type * as TS from "typescript";
import type { Ts } from "./ast";
import type { AkanFactReader, AkanSpan, Extent, ImportFact } from "./moduleFacts";

export interface RouteGuardCall {
  name: string;
  local: { span: AkanSpan; extent: Extent; doc: string | null } | null;
}

export interface RouteGuardFact {
  calls: RouteGuardCall[];
  span: AkanSpan;
}

export interface RouteFact {
  fileName: string;
  owner: string;
  kind: "page" | "layout";
  pattern: string;
  dir: string[];
  isRoot: boolean;
  line: number;
  character: number;
  guard: RouteGuardFact | null;
  imports: ImportFact[];
  alias: string | null;
}

interface RouteFileInfo {
  owner: string;
  key: string;
}

export class RouteFactReader {
  //? `page/(libs)/` holds git-ignored links to a lib's own pages, which the lib's `page/` already maps.
  static readonly #pagePattern = /^((?:apps|libs)\/[^/]+)\/page\/((?!(?:.*\/)?\(libs\)\/).+\.tsx?)$/;
  static readonly #guardPattern = /\.guard\s*\(/;
  static readonly #aliasPattern = /^export default ([A-Za-z_$][\w$]*)\s*;?\s*$/m;
  static readonly #workspacePattern = /^(?:\.|@(?:apps|libs)\/)/;
  readonly #ts: Ts;
  readonly #reader: AkanFactReader;
  readonly #parse: (fileName: string, text: string) => TS.SourceFile;

  constructor(ts: Ts, reader: AkanFactReader, parse: (fileName: string, text: string) => TS.SourceFile) {
    this.#ts = ts;
    this.#reader = reader;
    this.#parse = parse;
  }

  static fileOf(relative: string): RouteFileInfo | null {
    const match = relative.match(RouteFactReader.#pagePattern);
    return match ? { owner: match[1], key: `./${match[2]}` } : null;
  }

  read(fileName: string, info: RouteFileInfo, text: string, words: string): RouteFact | null {
    const ts = this.#ts;
    const parsed = tryParseRouteModuleKey(info.key);
    if (!parsed || parsed.kind === "overrides" || parsed.isInternalRootLayout) return null;
    //? Docs pages quote `export default …` at a line start inside template literals; only the parser tells them apart.
    const starts = [...text.matchAll(/^export default\b/gm)].map(({ index }) => index);
    const source = RouteFactReader.#guardPattern.test(text) || starts.length > 1 ? this.#parse(fileName, text) : null;
    const exported = source ? this.#exportOf(source) : null;
    const start = exported ? exported.getStart(source ?? undefined) : (starts[0] ?? 0);
    const head = text.slice(0, start);
    return {
      fileName,
      owner: info.owner,
      kind: parsed.kind,
      pattern: normalizeRoutePattern(parsed.sourceRouteSegments),
      dir: parsed.moduleSegments.slice(0, -1),
      isRoot: words.includes("\nrootLayout\n"),
      line: head.split("\n").length - 1,
      character: start - head.lastIndexOf("\n") - 1,
      guard: source && exported ? this.#guardOf(source, exported) : null,
      imports: source ? this.#reader.importsIn(source) : [],
      alias: source
        ? exported && ts.isExportAssignment(exported) && ts.isIdentifier(exported.expression)
          ? exported.expression.text
          : null
        : (text.match(RouteFactReader.#aliasPattern)?.[1] ?? null),
    };
  }

  #exportOf(source: TS.SourceFile) {
    const ts = this.#ts;
    return (
      source.statements.find(
        (statement) =>
          ts.isExportAssignment(statement) ||
          (ts.canHaveModifiers(statement) &&
            !!ts.getModifiers(statement)?.some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword)),
      ) ?? null
    );
  }

  declarationIn(source: TS.SourceFile, name: string) {
    const ts = this.#ts;
    const overloads = source.statements.filter(
      (statement): statement is TS.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === name,
    );
    const [first] = overloads;
    const last = overloads.at(-1);
    if (first?.name && last)
      return { statement: first, declared: first.name, extent: { start: first.getStart(source), end: last.getEnd() } };
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const declaration = statement.declarationList.declarations.find(
        (item) => ts.isIdentifier(item.name) && item.name.text === name,
      );
      if (declaration)
        return { statement, declared: declaration.name, extent: this.#reader.extentOf(source, statement) };
    }
    return null;
  }

  #guardOf(source: TS.SourceFile, exported: TS.Statement): RouteGuardFact | null {
    const ts = this.#ts;
    let current = ts.isExportAssignment(exported) ? this.#reader.unwrap(exported.expression) : null;
    while (current && ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
      const { name, expression } = current.expression;
      const [stage] = current.arguments;
      if (name.text === "guard" && stage)
        return { calls: this.#callsIn(source, stage), span: this.#reader.spanOf(source, name) };
      current = this.#reader.unwrap(expression);
    }
    return null;
  }

  //? A call to a name the workspace neither imports nor declares (`Boolean`, akanjs's `redirect`, `dayjs`) is looked
  //? through to its arguments; a known one is the guard, and the helpers it is handed (`isId(id)`) are not.
  #callsIn(source: TS.SourceFile, stage: TS.Expression): RouteGuardCall[] {
    const ts = this.#ts;
    const imports = this.#reader.importsIn(source).filter(({ from }) => RouteFactReader.#workspacePattern.test(from));
    const imported = new Set(imports.filter(({ imported }) => imported !== "*").map(({ name }) => name));
    const namespaces = new Set(imports.filter(({ imported }) => imported === "*").map(({ name }) => name));
    const shadowed = this.#namesDeclaredIn(stage);
    const calls = new Map<string, RouteGuardCall>();
    const callOf = (callee: TS.Expression) => {
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        namespaces.has(callee.expression.text) &&
        !shadowed.has(callee.expression.text)
      ) {
        const name = `${callee.expression.text}.${callee.name.text}`;
        if (!calls.has(name)) calls.set(name, { name, local: null });
        return true;
      }
      if (!ts.isIdentifier(callee) || shadowed.has(callee.text)) return false;
      const name = callee.text;
      if (calls.has(name)) return true;
      const declared = this.declarationIn(source, name);
      if (!declared && !imported.has(name)) return false;
      calls.set(name, {
        name,
        local: declared && {
          span: this.#reader.spanOf(source, declared.declared),
          extent: declared.extent,
          doc: this.#reader.docOf(source, declared.statement),
        },
      });
      return true;
    };
    const visit = (node: TS.Node): void => {
      if (ts.isCallExpression(node) && callOf(node.expression)) return;
      ts.forEachChild(node, visit);
    };
    if (ts.isIdentifier(stage)) callOf(stage);
    else visit(stage);
    return [...calls.values()];
  }

  #namesDeclaredIn(stage: TS.Expression) {
    const ts = this.#ts;
    const names = new Set<string>();
    const bind = (name: TS.BindingName) => {
      if (ts.isIdentifier(name)) names.add(name.text);
      else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bind(element.name);
    };
    const visit = (node: TS.Node): void => {
      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) bind(node.name);
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) names.add(node.name.text);
      ts.forEachChild(node, visit);
    };
    visit(stage);
    return names;
  }
}

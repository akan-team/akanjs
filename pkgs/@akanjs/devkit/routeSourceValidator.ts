import { getRouteExports } from "akanjs/common";
import ts from "typescript";

/** What the build needs out of a route module without evaluating it. */
export interface RouteSourceInfo {
  /** `pageConfig.devOnly === true`, or `.config({ devOnly: true })` on a chain, read straight off the AST. */
  devOnly: boolean;
  /** Present when the default export is a `page()` / `layout()` / `rootLayout()` chain. */
  chain?: RouteSourceChain;
}

export interface RouteSourceChain {
  kind: "page" | "layout" | "rootLayout";
  /** The `.param()` names, in chain order. */
  params: string[];
  /** The `.prompt()` name, when the page publishes itself as an MCP prompt. */
  prompt?: string;
  /** The `.app()` names, each one MCP App the build gives a view of its own. */
  apps: string[];
}

interface ChainStage {
  name: string;
  args: ts.NodeArray<ts.Expression>;
}

const chainRoots = new Set(["page", "layout", "rootLayout"]);

// Import dynamically: it pulls in `typescript` (+65MB resident). `Bun.Transpiler.scan()` reports only export names,
// too little for these checks.
export class RouteSourceValidator {
  static validateRouteSourceExports(
    source: string,
    filePath: string,
    kind: "page" | "layout",
    options: { rootLayout?: boolean; pattern?: string } = {},
  ): RouteSourceInfo {
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const allowed = getRouteExports(kind, { rootLayout: options.rootLayout });
    const exported = new Set<string>();
    const assertExport = (name: string) => {
      if (!allowed.has(name)) {
        throw new Error(`[route-convention] unsupported export "${name}" in ${filePath}`);
      }
      exported.add(name);
    };

    for (const statement of sourceFile.statements) {
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
      if (ts.isExportDeclaration(statement)) {
        if (statement.isTypeOnly) continue;
        const clause = statement.exportClause;
        if (!clause) throw new Error(`[route-convention] export * is not allowed in route modules: ${filePath}`);
        if (ts.isNamedExports(clause)) {
          for (const element of clause.elements) {
            if (element.isTypeOnly) continue;
            assertExport(element.name.text);
          }
        }
        continue;
      }
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
      const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (!isExported) continue;
      const isDefault = modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
      if (isDefault) {
        assertExport("default");
        continue;
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) assertExport(declaration.name.text);
        }
        continue;
      }
      const name = (statement as unknown as { name?: ts.Node }).name;
      if (name && ts.isIdentifier(name)) {
        assertExport(name.text);
      }
    }
    if (exported.has("head") && exported.has("generateHead")) {
      throw new Error(`[route-convention] head and generateHead cannot both be exported in ${filePath}`);
    }
    const chain = RouteSourceValidator.#readChain(sourceFile, filePath);
    if (!chain && exported.has("guard"))
      throw new Error(
        `[route-convention] ${filePath} exports guard beside a legacy default; declare it with .guard() on its chain`,
      );
    if (!chain) return { devOnly: RouteSourceValidator.#readDevOnly(sourceFile, filePath) };
    const named = [...exported].filter((name) => name !== "default");
    if (named.length)
      throw new Error(
        `[route-convention] ${filePath} exports ${named.join(", ")} beside its ${chain.kind}() chain — every route setting is a stage of the chain`,
      );
    if (kind === "page" && chain.kind !== "page")
      throw new Error(`[route-convention] ${filePath} is a page file but exports ${chain.kind}()`);
    if (kind === "layout" && chain.kind === "page")
      throw new Error(`[route-convention] ${filePath} is a layout file but exports page()`);
    if (options.pattern) RouteSourceValidator.#assertChainParams(chain, options.pattern, filePath);
    return {
      devOnly: chain.devOnly,
      chain: {
        kind: chain.kind,
        params: chain.params,
        ...(chain.prompt ? { prompt: chain.prompt } : {}),
        apps: chain.apps,
      },
    };
  }

  // Null for the legacy shape. Read off the source because the build enumerates routes without importing them.
  static #readChain(sourceFile: ts.SourceFile, filePath: string) {
    for (const statement of sourceFile.statements) {
      const local = RouteSourceValidator.#defaultLocalOf(statement);
      if (local && RouteSourceValidator.#bindsChain(sourceFile, local))
        throw new Error(
          `[route-convention] ${filePath} exports its chain through "${local}"; write \`export default page()…\` — the build reads the chain without evaluating the module`,
        );
      if (!ts.isExportAssignment(statement) || statement.isExportEquals) continue;
      const walked = RouteSourceValidator.#walkChain(RouteSourceValidator.#unwrapExpression(statement.expression));
      return walked ? RouteSourceValidator.#chainOf(walked.kind, walked.stages, filePath) : null;
    }
    return null;
  }

  static #defaultLocalOf(statement: ts.Statement): string | undefined {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const node = RouteSourceValidator.#unwrapExpression(statement.expression);
      return node && ts.isIdentifier(node) ? node.text : undefined;
    }
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier || statement.isTypeOnly) return undefined;
    const clause = statement.exportClause;
    if (!clause || !ts.isNamedExports(clause)) return undefined;
    const element = clause.elements.find((element) => !element.isTypeOnly && element.name.text === "default");
    return element?.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : undefined;
  }

  static #walkChain(start: ts.Expression | undefined) {
    let node = start;
    const stages: ChainStage[] = [];
    while (node && ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        stages.unshift({ name: callee.name.text, args: node.arguments });
        node = callee.expression;
        continue;
      }
      if (ts.isIdentifier(callee) && chainRoots.has(callee.text))
        return { kind: callee.text as RouteSourceChain["kind"], stages };
      return null;
    }
    return null;
  }

  static #bindsChain(sourceFile: ts.SourceFile, name: string) {
    return sourceFile.statements.some(
      (statement) =>
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === name &&
            !!RouteSourceValidator.#walkChain(RouteSourceValidator.#unwrapExpression(declaration.initializer)),
        ),
    );
  }

  static #chainOf(kind: RouteSourceChain["kind"], stages: ChainStage[], filePath: string) {
    const params: string[] = [];
    const apps: string[] = [];
    let prompt: string | undefined;
    let devOnly = false;
    const literal = (stage: ChainStage) => {
      const first = stage.args[0];
      if (!first || !ts.isStringLiteralLike(first))
        throw new Error(
          `[route-convention] .${stage.name}() takes a string literal first in ${filePath} — the build reads it without evaluating the module`,
        );
      return first.text;
    };
    for (const stage of stages) {
      if (stage.name === "param") params.push(literal(stage));
      else if (stage.name === "prompt") prompt = literal(stage);
      else if (stage.name === "app") apps.push(literal(stage));
      else if (stage.name === "config")
        devOnly = RouteSourceValidator.#devOnlyOf(RouteSourceValidator.#unwrapExpression(stage.args[0]), filePath);
    }
    return { kind, params, prompt, apps, devOnly };
  }

  /** The same rule the loader applies: a page names every `[x]` it sits under, a layout may name a subset. */
  static #assertChainParams(chain: { kind: string; params: string[] }, pattern: string, filePath: string) {
    const inPath = pattern
      .split("/")
      .filter((part) => part.startsWith(":"))
      .map((part) => part.slice(1))
      .filter((name) => name !== "lang");
    if (chain.params.includes("lang"))
      throw new Error(`[route-convention] ${filePath} declares .param("lang"), which every route receives undeclared`);
    const unknown = chain.params.find((name) => !inPath.includes(name));
    if (unknown)
      throw new Error(
        `[route-convention] ${filePath} declares .param("${unknown}") but no [${unknown}] segment is in its path`,
      );
    const undeclared = inPath.find((name) => !chain.params.includes(name));
    if (chain.kind === "page" && undeclared)
      throw new Error(
        `[route-convention] ${filePath} sits under [${undeclared}] but declares no .param("${undeclared}") — a page reads only what it declares`,
      );
  }

  // Only a literal is accepted: the build reads it without importing the route, and a value the parser cannot settle
  // would ship a route its author believed excluded.
  static #readDevOnly(sourceFile: ts.SourceFile, filePath: string): boolean {
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const isExported = ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (!isExported) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "pageConfig") continue;
        const initializer = RouteSourceValidator.#unwrapExpression(declaration.initializer);
        if (initializer && ts.isObjectLiteralExpression(initializer))
          return RouteSourceValidator.#devOnlyOf(initializer, filePath);
      }
    }
    return false;
  }

  static #devOnlyOf(config: ts.Expression | undefined, filePath: string): boolean {
    if (!config || !ts.isObjectLiteralExpression(config)) return false;
    for (const property of config.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name;
      const key = ts.isIdentifier(name) ? name.text : ts.isStringLiteral(name) ? name.text : null;
      if (key !== "devOnly") continue;
      const value = RouteSourceValidator.#unwrapExpression(property.initializer);
      if (value?.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (value?.kind === ts.SyntaxKind.FalseKeyword) return false;
      throw new Error(
        `[route-convention] devOnly must be a literal true or false in ${filePath} — the build reads it without evaluating the module`,
      );
    }
    return false;
  }

  static #unwrapExpression(expression?: ts.Expression): ts.Expression | undefined {
    let current = expression;
    while (
      current &&
      (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current))
    ) {
      current = current.expression;
    }
    return current;
  }

  // A logic-free manifest: imports plus one `export default override({ ... })`; `override` types the slots.
  static validateOverridesSourceExports(source: string, filePath: string) {
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const fail = (message: string): never => {
      throw new Error(`[route-convention] ${message}: ${filePath}`);
    };
    let defaultOverride: ts.ExportAssignment | null = null;
    for (const statement of sourceFile.statements) {
      //? A "use client" directive is unnecessary (the framework wraps the manifest) but harmless.
      if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) continue;
      if (ts.isImportDeclaration(statement)) continue;
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
      if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
        defaultOverride = statement;
        continue;
      }
      fail(`_overrides.tsx may only contain imports and a single "export default override({ ... })"`);
    }
    if (!defaultOverride) return fail(`_overrides.tsx must "export default override({ ... })"`);
    const expression = defaultOverride.expression;
    if (
      !ts.isCallExpression(expression) ||
      !ts.isIdentifier(expression.expression) ||
      expression.expression.text !== "override"
    )
      fail(
        `_overrides.tsx default export must be a call to "override", e.g. "export default override({ Modal: BrandModal })"`,
      );
  }
}

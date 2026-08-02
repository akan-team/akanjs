import ts from "typescript";

/**
 * Static enforcement of the `page/` route conventions, split out of `executors.ts` so that importing
 * an executor does not pull `typescript` (+65MB resident) into the module graph. Both validators need
 * a real AST — modifier inspection, `export *` rejection, statement-kind walking and call-expression
 * identity — so `Bun.Transpiler.scan()`, which only reports export names, cannot replace them.
 *
 * Import it dynamically (`await import("./routeSourceValidator")`) so long-lived processes that never
 * validate a route source stay lean.
 */
export class RouteSourceValidator {
  static readonly #pageExports = new Set([
    "default",
    "pageConfig",
    "head",
    "metadata",
    "generateHead",
    "generateMetadata",
    "Loading",
  ]);
  static readonly #rootLayoutExports = new Set([
    "default",
    "pageConfig",
    "head",
    "metadata",
    "generateHead",
    "generateMetadata",
    "fonts",
    "manifest",
    "theme",
    "reconnect",
    "layoutStyle",
    "gaTrackingId",
    "Loading",
    "NotFound",
    "Error",
  ]);
  static readonly #layoutExports = new Set([
    "default",
    "pageConfig",
    "head",
    "metadata",
    "generateHead",
    "generateMetadata",
    "Loading",
    "NotFound",
    "Error",
  ]);

  static validateRouteSourceExports(
    source: string,
    filePath: string,
    kind: "page" | "layout",
    options: { rootLayout?: boolean } = {},
  ) {
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const allowed =
      kind === "page"
        ? RouteSourceValidator.#pageExports
        : options.rootLayout
          ? RouteSourceValidator.#rootLayoutExports
          : RouteSourceValidator.#layoutExports;
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
    if (
      !options.rootLayout &&
      (exported.has("head") || exported.has("generateHead")) &&
      (exported.has("metadata") || exported.has("generateMetadata"))
    ) {
      throw new Error(
        `[route-convention] head/generateHead and metadata/generateMetadata cannot both be exported in ${filePath}`,
      );
    }
    if (exported.has("metadata") && exported.has("generateMetadata")) {
      throw new Error(`[route-convention] metadata and generateMetadata cannot both be exported in ${filePath}`);
    }
  }

  /**
   * Statically enforces that a `_overrides.tsx` route file is a logic-free activation manifest: a plain module
   * (no `"use client"` — the framework generates the client wrapper) that only imports components and binds them
   * to slots through a single `export default override({ Modal: BrandModal })`. It must not declare components
   * inline or run logic — that keeps the override contract a thin binding layer rather than a second place to
   * author UI. Slot names and value types are validated at compile time by `override`.
   */
  static validateOverridesSourceExports(source: string, filePath: string) {
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const fail = (message: string): never => {
      throw new Error(`[route-convention] ${message}: ${filePath}`);
    };
    let defaultOverride: ts.ExportAssignment | null = null;
    for (const statement of sourceFile.statements) {
      // A "use client" directive is unnecessary (the framework wraps the manifest) but harmless if present.
      if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) continue;
      // The manifest imports the app components it binds; imports and type-only decls carry no runtime logic.
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

import ts from "typescript";

/**
 * A single Akan UI recipe discovered by scanning source. `variants` maps each variant key to its allowed option
 * names (e.g. `{ variant: ["primary", "ghost"], size: ["sm", "md"] }`); a base-only recipe has `variants: {}`.
 * `importFrom` is the module a consumer imports the recipe from (e.g. `@apps/minimal/ui`).
 */
export interface RecipeInfo {
  name: string;
  importFrom: string;
  variants: Record<string, string[]>;
  defaultVariants?: Record<string, string>;
  doc?: string;
}

export interface RecipeSource {
  path: string;
  content: string;
  importFrom: string;
}

/**
 * Statically finds every `export const <name> = recipe(tv({ ... }))` across the given sources and extracts its
 * variant surface + leading JSDoc one-liner. Detection is by the `recipe(tv(...))` call shape (not by name suffix,
 * since base-only recipes like `appScreen` omit the `Recipe` suffix). Being AST-based, it never matches recipe
 * definitions that appear only inside string/template literals (e.g. code examples in docs pages).
 */
export const scanRecipes = (sources: RecipeSource[]): RecipeInfo[] => {
  const recipes: RecipeInfo[] = [];
  for (const source of sources) {
    const sourceFile = ts.createSourceFile(
      source.path,
      source.content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const parsed = parseRecipeCall(declaration.initializer);
        if (!parsed) continue;
        recipes.push({
          name: declaration.name.text,
          importFrom: source.importFrom,
          variants: parsed.variants,
          ...(parsed.defaultVariants ? { defaultVariants: parsed.defaultVariants } : {}),
          ...(getLeadingDoc(source.content, statement) ? { doc: getLeadingDoc(source.content, statement) } : {}),
        });
      }
    }
  }
  return recipes;
};

const isExported = (statement: ts.VariableStatement): boolean =>
  statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

/** Matches `recipe( tv( <ObjectLiteral> ) )` and returns the variant surface, or null for anything else. */
const parseRecipeCall = (
  initializer: ts.Expression,
): { variants: Record<string, string[]>; defaultVariants?: Record<string, string> } | null => {
  if (!ts.isCallExpression(initializer)) return null;
  if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== "recipe") return null;
  const tvCall = initializer.arguments[0];
  if (!tvCall || !ts.isCallExpression(tvCall)) return null;
  if (!ts.isIdentifier(tvCall.expression) || tvCall.expression.text !== "tv") return null;
  const config = tvCall.arguments[0];
  if (!config || !ts.isObjectLiteralExpression(config)) return null;
  return extractVariants(config);
};

const extractVariants = (config: ts.ObjectLiteralExpression) => {
  const variants: Record<string, string[]> = {};
  let defaultVariants: Record<string, string> | undefined;
  for (const property of config.properties) {
    if (!ts.isPropertyAssignment(property) || !isNamed(property.name)) continue;
    const key = propName(property.name);
    if (key === "variants" && ts.isObjectLiteralExpression(property.initializer)) {
      for (const variant of property.initializer.properties) {
        if (!ts.isPropertyAssignment(variant) || !isNamed(variant.name)) continue;
        if (!ts.isObjectLiteralExpression(variant.initializer)) continue;
        variants[propName(variant.name)] = variant.initializer.properties
          .filter((option): option is ts.PropertyAssignment => ts.isPropertyAssignment(option) && isNamed(option.name))
          .map((option) => propName(option.name));
      }
    } else if (key === "defaultVariants" && ts.isObjectLiteralExpression(property.initializer)) {
      defaultVariants = {};
      for (const preset of property.initializer.properties) {
        if (!ts.isPropertyAssignment(preset) || !isNamed(preset.name)) continue;
        defaultVariants[propName(preset.name)] = ts.isStringLiteral(preset.initializer)
          ? preset.initializer.text
          : preset.initializer.getText();
      }
    }
  }
  return { variants, defaultVariants };
};

const isNamed = (name: ts.PropertyName): name is ts.Identifier | ts.StringLiteral =>
  ts.isIdentifier(name) || ts.isStringLiteral(name);
const propName = (name: ts.Identifier | ts.StringLiteral): string => name.text;

/** The first non-empty line of the JSDoc/line comment immediately preceding the statement, markers stripped. */
const getLeadingDoc = (fullText: string, node: ts.Node): string | undefined => {
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges?.length) return undefined;
  const { pos, end } = ranges[ranges.length - 1];
  const line = fullText
    .slice(pos, end)
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/\s*$/, "")
    .replace(/^\/\/+/gm, "")
    .split("\n")
    .map((row) => row.replace(/^\s*\*\s?/, "").trim())
    .find((row) => row.length > 0);
  return line || undefined;
};

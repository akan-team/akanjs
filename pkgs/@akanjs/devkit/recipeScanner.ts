import { readdir } from "node:fs/promises";
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
  /** The recipe's `base` class string when it is a plain string literal — the SSOT fingerprint. */
  base?: string;
}

export interface RecipeSource {
  path: string;
  content: string;
  importFrom: string;
}

/**
 * Collects every recipe source under a `ui` folder. Recipes live one-per-file in a `Recipe/` folder
 * (`recipe/` for the framework), so this reads the whole folder; the flat `Recipe.ts` is still read for
 * apps that have not moved yet. Every consumer of `scanRecipes` must go through here — three call sites
 * (AGENTS.md recipe index, `recipeGate` lint, MCP module context) hardcoded the flat path before, and each
 * one fails silently (empty list, no error) when the file is absent.
 */
export const collectRecipeSources = async (
  uiDirPath: string,
  importFrom: string,
  basename = "Recipe",
): Promise<RecipeSource[]> => {
  const read = async (filePath: string): Promise<RecipeSource | null> => {
    const content = await Bun.file(filePath)
      .text()
      .catch(() => "");
    return content ? { path: filePath, content, importFrom } : null;
  };
  const flat = await read(`${uiDirPath}/${basename}.ts`);
  const dirEntries = await readdir(`${uiDirPath}/${basename}`).catch(() => [] as string[]);
  const fromDir = await Promise.all(
    dirEntries
      .filter((entry) => entry.endsWith(".ts") && entry !== "index.ts" && !/\.(test|spec)\.ts$/.test(entry))
      .sort()
      .map((entry) => read(`${uiDirPath}/${basename}/${entry}`)),
  );
  return [flat, ...fromDir].filter((source): source is RecipeSource => !!source);
};

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
          ...(parsed.base ? { base: parsed.base } : {}),
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
): { variants: Record<string, string[]>; defaultVariants?: Record<string, string>; base?: string } | null => {
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
  let base: string | undefined;
  for (const property of config.properties) {
    if (!ts.isPropertyAssignment(property) || !isNamed(property.name)) continue;
    const key = propName(property.name);
    if (key === "base" && ts.isStringLiteral(property.initializer)) {
      base = property.initializer.text;
    } else if (key === "variants" && ts.isObjectLiteralExpression(property.initializer)) {
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
  return { variants, defaultVariants, base };
};

const isNamed = (name: ts.PropertyName): name is ts.Identifier | ts.StringLiteral =>
  ts.isIdentifier(name) || ts.isStringLiteral(name);
const propName = (name: ts.Identifier | ts.StringLiteral): string => name.text;

export interface RecipeDuplicate {
  recipe: string;
  path: string;
  line: number;
  className: string;
}

/**
 * Fraction of a recipe's base tokens an inline className must reproduce to count as a duplicate.
 *
 * Requiring *every* token (the original rule) only caught a verbatim copy of the whole base, which is the one
 * form of duplication that essentially never happens: someone re-authoring a look reproduces the gist, not all
 * eight tokens. So the check passed on exactly the near-duplicates it existed to find, and silently — it is an
 * advisory, so nothing went red. A ratio catches those; false positives are cheap here for the same reason.
 */
const DUPLICATE_TOKEN_RATIO = 0.7;

/** Minimum base tokens for a recipe to be worth fingerprinting at all. */
const MIN_FINGERPRINT_TOKENS = 3;

/**
 * SSOT advisory: finds JSX `className` string values that hand-rewrite a recipe's base fingerprint instead of
 * consuming the recipe. Only recipes whose base has 3+ distinctive tokens are checked — shorter fingerprints
 * (`grid gap-3` …) are generic utilities and would flood the report with false positives. A className counts as
 * a duplicate once it reproduces {@link DUPLICATE_TOKEN_RATIO} of those tokens, so a near-copy that drops or
 * swaps one still reports. AST-scoped to real `className` attributes, so class strings inside doc-example
 * template literals never match.
 */
export const findInlineRecipeDuplicates = (
  recipes: RecipeInfo[],
  files: { path: string; content: string }[],
): RecipeDuplicate[] => {
  const fingerprints = recipes
    .map((recipe) => ({ recipe: recipe.name, tokens: (recipe.base ?? "").split(/\s+/).filter(Boolean) }))
    .filter((fingerprint) => fingerprint.tokens.length >= MIN_FINGERPRINT_TOKENS)
    // Ceil so the threshold never rounds below the minimum: a 3-token base still needs 3 of 3.
    .map((fingerprint) => ({ ...fingerprint, needed: Math.ceil(fingerprint.tokens.length * DUPLICATE_TOKEN_RATIO) }));
  if (fingerprints.length === 0) return [];
  const duplicates: RecipeDuplicate[] = [];
  for (const file of files) {
    const sourceFile = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "className" && node.initializer) {
        for (const value of stringValuesIn(node.initializer)) {
          const classSet = new Set(value.split(/\s+/));
          for (const fingerprint of fingerprints) {
            const matched = fingerprint.tokens.filter((token) => classSet.has(token)).length;
            if (matched >= fingerprint.needed) {
              const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
              duplicates.push({ recipe: fingerprint.recipe, path: file.path, line: line + 1, className: value });
            }
          }
        }
      }
      node.forEachChild(visit);
    };
    visit(sourceFile);
  }
  return duplicates;
};

const stringValuesIn = (node: ts.Node): string[] => {
  const values: string[] = [];
  const visit = (child: ts.Node) => {
    if (
      ts.isStringLiteral(child) ||
      ts.isNoSubstitutionTemplateLiteral(child) ||
      ts.isTemplateHead(child) ||
      ts.isTemplateMiddle(child) ||
      ts.isTemplateTail(child)
    )
      values.push(child.text);
    child.forEachChild(visit);
  };
  visit(node);
  return values;
};

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

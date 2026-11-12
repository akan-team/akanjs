import type { RecipeInfo, RecipeSource } from "../context/recipeScanner";

// Lazy: recipeScanner loads `typescript` (~65MB) and this module sits in the CLI entry graph (entryModuleGraph test).
let recipeScannerLoad: Promise<typeof import("../context/recipeScanner")> | null = null;
const loadRecipeScanner = () => (recipeScannerLoad ??= import("../context/recipeScanner"));

//* Split by ownership (root: framework recipes; each app/lib: what it may import), so always-loaded context does not
//* grow with the app count and no unimportable neighbour recipe is listed.

export const AGENT_BLOCK_START = "<!-- akan:agent:start -->";
export const AGENT_BLOCK_END = "<!-- akan:agent:end -->";

const AGENT_VERSION_PREFIX = "<!-- akan:agent:version ";

/** Nothing re-runs `akan agent install` on its own, so `akan doctor` compares this stamp against the installed devkit. */
export const stampBlockVersion = (block: string, version: string): string =>
  `${AGENT_VERSION_PREFIX}${version} -->\n\n${block}`;

/** The stamped version of a committed AGENTS.md, or null when it predates stamping or carries no block. */
export const extractBlockVersion = (content: string): string | null =>
  content.match(/<!-- akan:agent:version ([^\s]+) -->/)?.[1] ?? null;

/** The running `@akanjs/devkit` version; null when its package.json is unreadable, which must not fail a doctor run. */
export const readDevkitVersion = async (): Promise<string | null> => {
  const { readFile } = await import("node:fs/promises");
  const { getDirname } = await import("../util/fileSys");
  const dirname = getDirname(import.meta.url);
  for (const candidate of [`${dirname}/package.json`, `${dirname}/../package.json`]) {
    try {
      return (JSON.parse(await readFile(candidate, "utf-8")) as { version?: string }).version ?? null;
    } catch {
      //? The bundled CLI sits beside its own package.json; devkit's source sits one folder below its own.
    }
  }
  return null;
};

export interface AgentsIndexScope {
  type: "app" | "lib";
  name: string;
}

/** Replace the content between the akan:agent markers, preserving everything else; append when absent. */
export const upsertAgentBlock = (existing: string, block: string): string => {
  const managed = `${AGENT_BLOCK_START}\n${block}\n${AGENT_BLOCK_END}`;
  const startIndex = existing.indexOf(AGENT_BLOCK_START);
  const endIndex = existing.indexOf(AGENT_BLOCK_END);
  if (startIndex >= 0 && endIndex > startIndex) {
    return `${existing.slice(0, startIndex)}${managed}${existing.slice(endIndex + AGENT_BLOCK_END.length)}`;
  }
  return `${existing.trimEnd()}\n\n${managed}\n`;
};

/** The content between the akan:agent markers, or null when the file carries no managed block. */
export const extractAgentBlock = (content: string): string | null => {
  const startIndex = content.indexOf(AGENT_BLOCK_START);
  const endIndex = content.indexOf(AGENT_BLOCK_END);
  if (startIndex < 0 || endIndex <= startIndex) return null;
  return content.slice(startIndex + AGENT_BLOCK_START.length, endIndex).trim();
};

// Variant signature — the full consumption contract, so an agent never has to open the recipe
// file (and pull its css bodies into context) just to call one. `*` = default, `key?` = boolean flag.
const signatureOf = (recipe: RecipeInfo): string => {
  const entries = Object.entries(recipe.variants);
  if (entries.length === 0) return "";
  const parts = entries.map(([key, values]) => {
    if (values.length === 1 && values[0] === "true") return `${key}?`;
    const def = recipe.defaultVariants?.[key];
    return `${key}: ${values.map((value) => (value === def ? `${value}*` : value)).join("|")}`;
  });
  return `(${parts.join(" · ")})`;
};

/** Recipes grouped by import path as markdown list blocks — the shared body of every recipe index. */
export const renderRecipeEntries = (recipes: RecipeInfo[]): string => {
  const groups = new Map<string, RecipeInfo[]>();
  for (const recipe of recipes) groups.set(recipe.importFrom, [...(groups.get(recipe.importFrom) ?? []), recipe]);
  return [...groups.entries()]
    .map(([importFrom, list]) => {
      const items = list
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((recipe) => `- \`${recipe.name}\`${signatureOf(recipe)}${recipe.doc ? ` — ${recipe.doc}` : ""}`)
        .join("\n");
      return `Import from \`${importFrom}\`:\n${items}`;
    })
    .join("\n\n");
};

/** Own `ui/Recipe/` plus each dependency lib's; framework recipes live in the root AGENTS.md instead. */
export const collectScopeRecipeSources = async (
  workspaceRoot: string,
  scope: AgentsIndexScope,
  libDeps: string[],
): Promise<RecipeSource[]> => {
  const { collectRecipeSources } = await loadRecipeScanner();
  const sources: RecipeSource[] = [
    ...(await collectRecipeSources(
      `${workspaceRoot}/${scope.type}s/${scope.name}/ui`,
      `@${scope.type}s/${scope.name}/ui`,
    )),
  ];
  for (const lib of [...new Set(libDeps)].sort()) {
    if (scope.type === "lib" && lib === scope.name) continue;
    sources.push(...(await collectRecipeSources(`${workspaceRoot}/libs/${lib}/ui`, `@libs/${lib}/ui`)));
  }
  return sources;
};

/** Collect + scan in one call, so consumers need no value import of the scanner stack. */
export const scanScopeRecipes = async (
  workspaceRoot: string,
  scope: AgentsIndexScope,
  libDeps: string[],
): Promise<RecipeInfo[]> => {
  const { scanRecipes } = await loadRecipeScanner();
  return scanRecipes(await collectScopeRecipeSources(workspaceRoot, scope, libDeps));
};

/** The managed block of a scope AGENTS.md — deterministic, so lint can compare it against a re-scan. */
export const renderScopeAgentBlock = (scope: AgentsIndexScope, recipes: RecipeInfo[]): string => {
  const scopePath = `${scope.type}s/${scope.name}`;
  const intro = `## Recipes In Scope

UI recipes importable from \`${scopePath}\` code, **in addition to** the framework recipes indexed in
\`.claude/rules/akan/style.md\`. Same contract: import by exact name, then \`<name>(variants?, className?)\` — the second
arg merges internally and takes an array too, so never wrap it in \`cn()\`. \`*\` marks the default, \`key?\` is a
boolean flag. Do not guess recipe names or import paths; this index is regenerated by \`akan sync ${scope.name}\`
and verified by \`akan lint ${scope.name}\`.`;
  if (recipes.length === 0) {
    return `${intro}

No scope recipes yet. Before inlining a repeated surface (card, box, tile, …), reuse a framework recipe from
\`.claude/rules/akan/style.md\` or author one as \`${scopePath}/ui/Recipe/<name>.ts\` (one recipe per file, re-exported from that
folder's \`index.ts\`) — see the \`recipeRule\` guideline.`;
  }
  return `${intro}

${renderRecipeEntries(recipes)}`;
};

/** A fresh scope AGENTS.md: a short hand-editable header around the managed block. */
export const renderScopeAgentsMd = (scope: AgentsIndexScope, block: string): string => `# ${scope.name} — Agent Guide

Scoped guide for coding agents working in \`${scope.type}s/${scope.name}\`. Workspace-wide conventions live in the
root \`AGENTS.md\`; this file carries what is importable from this ${scope.type === "app" ? "app" : "library"}. The
section between the \`akan:agent\` markers is regenerated by \`akan sync ${scope.name}\`; edit anything outside the
markers freely.

${AGENT_BLOCK_START}
${block}
${AGENT_BLOCK_END}
`;

export const CLAUDE_COMMENT_RULE = `## Comments — Overrides Your Default

Write **no comments** unless the comment passes the test below. This is the rule agents break most often here, so it
is repeated outside the guide: a diff that adds a comment the test rejects is a diff to redo.

Before typing \`//\`, \`/*\`, or a doc block, ask — **does this sentence carry a fact that is nowhere in the code?**

- Restates the identifier, the signature, or the line under it → delete it.
- Labels a section (\`// helpers\`, \`// state\`) or narrates a step (\`// fetch the user\`, \`// then save\`) → delete it.
- JSDoc on an ordinary function, or a why/how preamble on ordinary logic → delete it.
- Explains the edit you just made, for whoever reads the diff → say it in your reply, not in the file.
- Names a vendor or protocol quirk, an infrastructure constraint, a library gotcha, security reasoning, a math
  derivation, a domain field's business meaning, a state transition, or why an obvious alternative was rejected →
  keep it, one line.

That keep-list is exact — \`Comments\` in the guide is the full version. "It aids readability" and "this logic is
subtle" are not on it: rename or split the code instead. When you edit an existing file, match its density; if the
surrounding code carries none, your diff carries none.`;

export const renderScopeClaudeMd = (scope: AgentsIndexScope): string => `# ${scope.name} — Claude Code Guide

@AGENTS.md

${CLAUDE_COMMENT_RULE}
`;

import type { RecipeInfo, RecipeSource } from "./recipeScanner";

// recipeScanner 는 상단에서 typescript(~65MB)를 끌어온다. 이 모듈은 executors(CLI 엔트리 그래프)에
// 상주하므로 스캔 스택은 첫 사용 시점에 지연 로드한다 — 정적 import 로 되돌리면 entryModuleGraph 테스트가 깨진다.
let recipeScannerLoad: Promise<typeof import("./recipeScanner")> | null = null;
const loadRecipeScanner = () => (recipeScannerLoad ??= import("./recipeScanner"));

/**
 * agentsIndex — 스코프별 에이전트 색인의 단일 렌더러.
 *
 * 색인은 소유 경계로 쪼갠다: 루트 AGENTS.md 는 프레임워크(akanjs/ui) 레시피만 싣고, 각 앱/lib 은
 * 자기 스코프에서 import 가능한 레시피(own + 의존 lib)를 자기 AGENTS.md 에 싣는다. 항상 로드되는
 * 컨텍스트가 앱 수에 비례해 커지는 것과, import 불가능한 이웃 앱 레시피가 환상을 유발하는 것을 막는다.
 *
 * 신선도는 두 지점이 보장한다: `SysExecutor.scan(write)` 가 재생성하고(akan sync/build/start 가 전부
 * 지나가는 길목), `akan lint` 가 스캔 결과와 커밋된 블록을 비교해 stale 이면 실패시킨다.
 */

export const AGENT_BLOCK_START = "<!-- akan:agent:start -->";
export const AGENT_BLOCK_END = "<!-- akan:agent:end -->";

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
  return `${existing.replace(/\s*$/, "")}\n\n${managed}\n`;
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

/**
 * Every recipe source importable from the scope: its own `ui/Recipe/` plus each dependency lib's.
 * Framework recipes are excluded on purpose — they live in the root AGENTS.md, valid for every scope.
 */
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

UI recipes importable from \`${scopePath}\` code, **in addition to** the framework recipes indexed in the root
\`AGENTS.md\` \`## Recipes\`. Same contract: import by exact name, then \`<name>(variants?, className?)\` — the second
arg merges internally and takes an array too, so never wrap it in \`cn()\`. \`*\` marks the default, \`key?\` is a
boolean flag. Do not guess recipe names or import paths; this index is regenerated by \`akan sync ${scope.name}\`
and verified by \`akan lint ${scope.name}\`.`;
  if (recipes.length === 0) {
    return `${intro}

No scope recipes yet. Before inlining a repeated surface (card, box, tile, …), reuse a framework recipe from the
root \`AGENTS.md\` or author one as \`${scopePath}/ui/Recipe/<name>.ts\` (one recipe per file, re-exported from that
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

/** Claude Code reads nested CLAUDE.md files as it works under a directory; keep it a thin pointer. */
export const renderScopeClaudeMd = (scope: AgentsIndexScope): string => `# ${scope.name} — Claude Code Guide

@AGENTS.md
`;

# Recipe Rule Guideline

## Purpose
Recipes are the reusable-look layer of Akan UI: Tailwind-variant factories (`recipe(tv({...}))`) that sit between semantic
tokens (values) and components (behavior). This rule governs how agents **consume** and **author** recipes so a look is not
hallucinated, re-derived inline, or duplicated across an app.

## Ownership
- A recipe owns a **look** (a composition of semantic-token utility classes), never behavior. Behavior lives in components.
- App/lib recipes live in `apps/<app>/ui/Recipe.ts` and `libs/<lib>/ui/Recipe.ts`; framework recipes (`buttonRecipe`,
  `badgeRecipe`) live in `akanjs/ui`.
- Recipes use **semantic tokens only** in their `base`/`variants` (never raw palette or hex); they inherit the CSS token rules.

## Consuming Recipes
- Import by **exact name** from the owning barrel: `import { <name> } from "@apps/<app>/ui"` (or `akanjs/ui` for framework),
  then call `<name>(variants?, className?)` — the second arg is merged automatically; never wrap it in `cn()`.
- **Do not guess** recipe names or import paths. The authoritative list is the `## UI Recipes` section of `AGENTS.md`
  (always loaded) and, when connected, the `list_recipes` MCP tool / `akan recipe list` CLI.
- Variant options are typed (`Parameters<typeof <name>>[0]`), so a wrong variant is a compile error — let tsc validate
  options rather than memorizing strings.

## Authoring Recipes
- A **reusable or repeated surface** (card, box, tile, chat bubble, hero, …) belongs in a recipe, **not** inline. If the same
  token-class stack appears in more than one place, extract it into a recipe.
- **Before authoring, check the existing recipe list** (AGENTS `## UI Recipes` / `list_recipes`) and **reuse** a matching
  recipe instead of creating a near-duplicate — registry sprawl comes from re-inventing looks that already exist.
- Add a new recipe as `export const <name>Recipe = recipe(tv({ base, variants }))` in the owning `ui/Recipe.ts`, with a
  one-line JSDoc describing the surface. Name it `<name>Recipe`.
- App recipes **extend** (surfaces the framework lacks); they never re-define a framework component's look in parallel.

## Codegen Rules
- Do not re-derive inline a look that an existing recipe already provides.
- Do not author a near-duplicate of an existing recipe; reuse or extend it.
- Do not guess recipe names or import paths; use the authoritative list.
- Do not put raw-palette / hex / inline color in a recipe; semantic tokens only.

## Review Checklist
- Repeated/variant surfaces are recipes, not inline class stacks duplicated across files.
- No two recipes describe the same look; consumers import by exact name from the correct barrel.
- New recipes live in the owning `ui/Recipe.ts`, named `<name>Recipe`, token-only, with a one-line doc.
- The output contract tells the model which file paths to return.

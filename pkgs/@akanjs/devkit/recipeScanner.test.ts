import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectRecipeSources, findInlineRecipeDuplicates, type RecipeInfo, scanRecipes } from "./recipeScanner";

const byName = (recipes: RecipeInfo[], name: string) => recipes.find((recipe) => recipe.name === name);

// Mirrors pkgs/akanjs/ui/recipe/ (framework) — two recipes in one source, variant + size surfaces.
// The scanner is per-source, so a folder of one-recipe files and a legacy multi-recipe file both parse.
const FRAMEWORK = `
import { recipe, tv } from "./recipeFactory";
export const buttonRecipe = recipe(
  tv({
    base: "inline-flex items-center",
    variants: {
      variant: { primary: "bg-primary", ghost: "bg-transparent", link: "underline" },
      size: { sm: "h-8", md: "h-10", lg: "h-12" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }),
);
export type ButtonVariants = NonNullable<Parameters<typeof buttonRecipe>[0]>;
export const badgeRecipe = recipe(tv({ base: "rounded-full", variants: { variant: { default: "bg-muted", info: "bg-info" } } }));
`;

// Mirrors apps/minimal/ui/Recipe/ shapes — base-only (no variants) + single-variant, with per-export JSDoc.
const APP = `
import { recipe, tv } from "akanjs/ui";
/** 전체 화면 배경/전경. 페이지 루트 컨테이너. */
export const appScreen = recipe(tv({ base: "min-h-screen bg-background text-foreground" }));
/** 챗 버블 — 수신/발신 방향에 따라 정렬·색을 바꾼다. */
export const chatBubbleRecipe = recipe(
  tv({ base: "max-w-[78%] rounded-3xl", variants: { side: { incoming: "bg-muted", outgoing: "ml-auto bg-primary" } }, defaultVariants: { side: "incoming" } }),
);
`;

// A docs page: the ONLY real code is a layout div; a recipe "definition" lives inside a template-literal code sample.
const DOCS_TSX = `
import { Code } from "akanjs/ui";
export default function Page() {
  return (
    <div>
      <Code.Snippet code={\`export const fakeRecipe = recipe(tv({ base: "bg-primary", variants: { tone: { a: "x" } } }));\`} />
    </div>
  );
}
`;

describe("scanRecipes", () => {
  test("detects framework recipes with full variant surface", () => {
    const recipes = scanRecipes([{ path: "recipe.ts", content: FRAMEWORK, importFrom: "akanjs/ui" }]);
    expect(recipes.map((r) => r.name).sort()).toEqual(["badgeRecipe", "buttonRecipe"]);

    const button = byName(recipes, "buttonRecipe");
    expect(button?.importFrom).toBe("akanjs/ui");
    expect(button?.variants.variant).toEqual(["primary", "ghost", "link"]);
    expect(button?.variants.size).toEqual(["sm", "md", "lg"]);
    expect(button?.defaultVariants).toEqual({ variant: "primary", size: "md" });

    const badge = byName(recipes, "badgeRecipe");
    expect(badge?.variants.variant).toEqual(["default", "info"]);
    expect(badge?.defaultVariants).toBeUndefined();
  });

  test("handles base-only recipes and captures the JSDoc one-liner", () => {
    const recipes = scanRecipes([{ path: "Recipe.ts", content: APP, importFrom: "@apps/minimal/ui" }]);

    const screen = byName(recipes, "appScreen");
    expect(screen?.variants).toEqual({}); // base-only → empty variant surface
    expect(screen?.doc).toBe("전체 화면 배경/전경. 페이지 루트 컨테이너.");
    expect(screen?.importFrom).toBe("@apps/minimal/ui");

    const bubble = byName(recipes, "chatBubbleRecipe");
    expect(bubble?.variants.side).toEqual(["incoming", "outgoing"]);
    expect(bubble?.doc).toBe("챗 버블 — 수신/발신 방향에 따라 정렬·색을 바꾼다.");
  });

  test("does NOT match recipe definitions inside string/template literals (docs code samples)", () => {
    const recipes = scanRecipes([{ path: "ui-recipe.tsx", content: DOCS_TSX, importFrom: "@apps/akan/ui" }]);
    expect(recipes).toEqual([]);
  });

  test("skips recipe() calls whose argument is not tv(...)", () => {
    const src = `export const x = recipe(buildStyles());\nexport const y = recipe(tv({ base: "a" }));`;
    const recipes = scanRecipes([{ path: "f.ts", content: src, importFrom: "@x" }]);
    expect(recipes.map((r) => r.name)).toEqual(["y"]);
  });

  test("ignores non-exported recipe consts and merges multiple sources", () => {
    const src = `const hidden = recipe(tv({ base: "a" }));\nexport const shown = recipe(tv({ base: "b" }));`;
    const recipes = scanRecipes([
      { path: "a.ts", content: src, importFrom: "@a" },
      { path: "b.ts", content: `export const other = recipe(tv({ base: "c" }));`, importFrom: "@b" },
    ]);
    expect(recipes.map((r) => `${r.name}@${r.importFrom}`).sort()).toEqual(["other@@b", "shown@@a"]);
  });
});

// Recipes moved from a flat `ui/Recipe.ts` to a `ui/Recipe/` folder. Three consumers (the AGENTS.md recipe
// index, the recipeGate lint, the MCP module context) go through collectRecipeSources, and every one of them
// degrades silently — empty list, no error — if it stops finding sources. These tests are that alarm.
// The advisory exists to catch a look being re-authored inline. Requiring every base token only matched a
// verbatim copy of the whole base — the one shape that never occurs in practice — so it reported nothing on
// the near-copies it was built for, and silently, being advisory. These tests pin the ratio behaviour.
describe("findInlineRecipeDuplicates", () => {
  // 8 tokens → ceil(8 * 0.7) = 6 must be reproduced.
  const EIGHT = `export const cardRecipe = recipe(tv({ base: "flex rounded-box border border-border bg-card p-4 text-card-foreground shadow-sm" }));`;
  const THREE = `export const gridRecipe = recipe(tv({ base: "grid gap-3 xl:grid-cols-2" }));`;
  const recipesOf = (src: string) => scanRecipes([{ path: "Recipe.ts", content: src, importFrom: "@apps/x/ui" }]);
  const hits = (src: string, jsx: string) =>
    findInlineRecipeDuplicates(recipesOf(src), [{ path: "Page.tsx", content: jsx }]).map((d) => d.recipe);

  test("flags a verbatim re-author of the whole base", () => {
    const jsx = `<div className="flex rounded-box border border-border bg-card p-4 text-card-foreground shadow-sm" />`;
    expect(hits(EIGHT, jsx)).toEqual(["cardRecipe"]);
  });

  test("flags a near-copy that drops two tokens — the case the exact-match rule missed", () => {
    const jsx = `<div className="flex rounded-box border border-border bg-card p-4" />`;
    expect(hits(EIGHT, jsx)).toEqual(["cardRecipe"]);
  });

  test("ignores a className that merely shares a few generic utilities", () => {
    expect(hits(EIGHT, `<div className="flex border p-4" />`)).toEqual([]);
  });

  test("still requires every token of a minimum-length fingerprint", () => {
    expect(hits(THREE, `<div className="grid gap-3 xl:grid-cols-2" />`)).toEqual(["gridRecipe"]);
    expect(hits(THREE, `<div className="grid gap-3" />`)).toEqual([]);
  });

  test("does not flag a className that consumes the recipe", () => {
    expect(hits(EIGHT, `<div className={cardRecipe({}, "w-full")} />`)).toEqual([]);
  });
});

describe("collectRecipeSources", () => {
  const seed = async (files: Record<string, string>) => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-recipe-"));
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      await Bun.write(abs, content);
    }
    return root;
  };
  const recipeSrc = (name: string) => `export const ${name} = recipe(tv({ base: "a" }));`;

  test("reads every recipe file in the folder, skipping index and tests", async () => {
    const root = await seed({
      "ui/Recipe/index.ts": `export * from "./appCard";`,
      "ui/Recipe/appCard.ts": recipeSrc("appCard"),
      "ui/Recipe/appBox.ts": recipeSrc("appBox"),
      "ui/Recipe/appBox.test.ts": recipeSrc("shouldBeSkipped"),
      "ui/Recipe/notes.md": "ignored",
    });
    const sources = await collectRecipeSources(path.join(root, "ui"), "@apps/x/ui");
    expect(sources).toHaveLength(2);
    expect(
      scanRecipes(sources)
        .map((r) => r.name)
        .sort(),
    ).toEqual(["appBox", "appCard"]);
  });

  test("still reads a flat Recipe.ts so an unmigrated app keeps working", async () => {
    const root = await seed({ "ui/Recipe.ts": recipeSrc("legacy") });
    const sources = await collectRecipeSources(path.join(root, "ui"), "@apps/x/ui");
    expect(scanRecipes(sources).map((r) => r.name)).toEqual(["legacy"]);
  });

  test("honours the framework's lowercase basename", async () => {
    const root = await seed({ "ui/recipe/buttonRecipe.ts": recipeSrc("buttonRecipe") });
    const sources = await collectRecipeSources(path.join(root, "ui"), "akanjs/ui", "recipe");
    expect(scanRecipes(sources).map((r) => r.name)).toEqual(["buttonRecipe"]);
  });

  test("returns nothing when neither shape exists, without throwing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-recipe-"));
    await writeFile(path.join(root, "placeholder"), "");
    expect(await collectRecipeSources(path.join(root, "ui"), "@apps/x/ui")).toEqual([]);
  });
});

import { describe, expect, test } from "bun:test";
import { type RecipeInfo, scanRecipes } from "./recipeScanner";

const byName = (recipes: RecipeInfo[], name: string) => recipes.find((recipe) => recipe.name === name);

// Mirrors pkgs/akanjs/ui/recipe.ts (framework) — two recipes in one file, variant + size surfaces.
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

// Mirrors apps/minimal/ui/Recipe.ts shapes — base-only (no variants) + single-variant, with per-export JSDoc.
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

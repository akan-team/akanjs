import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AGENT_BLOCK_END,
  AGENT_BLOCK_START,
  collectScopeRecipeSources,
  extractAgentBlock,
  renderRecipeEntries,
  renderScopeAgentBlock,
  renderScopeAgentsMd,
  renderScopeClaudeMd,
  upsertAgentBlock,
} from "./agentsIndex";
import type { RecipeInfo } from "./recipeScanner";

const button: RecipeInfo = {
  name: "buttonRecipe",
  importFrom: "akanjs/ui",
  variants: { variant: ["primary", "ghost"], size: ["sm", "md"] },
  defaultVariants: { variant: "primary", size: "md" },
  doc: "버튼 look",
};
const appCard: RecipeInfo = { name: "appCard", importFrom: "@apps/minimal/ui", variants: { tone: ["muted", "glass"] } };

describe("renderRecipeEntries", () => {
  test("groups by import path and marks defaults", () => {
    const entries = renderRecipeEntries([button, appCard]);
    expect(entries).toContain("Import from `akanjs/ui`:");
    expect(entries).toContain("Import from `@apps/minimal/ui`:");
    expect(entries).toContain("`buttonRecipe`(variant: primary*|ghost · size: sm|md*) — 버튼 look");
    expect(entries).toContain("`appCard`(tone: muted|glass)");
  });
});

describe("renderScopeAgentBlock", () => {
  test("carries the sync/lint contract and the scope's entries", () => {
    const block = renderScopeAgentBlock({ type: "app", name: "minimal" }, [appCard]);
    expect(block).toContain("## Recipes In Scope");
    expect(block).toContain("akan sync minimal");
    expect(block).toContain("akan lint minimal");
    expect(block).toContain("`appCard`");
  });
  test("empty scope points to authoring instead of listing nothing", () => {
    const block = renderScopeAgentBlock({ type: "lib", name: "util" }, []);
    expect(block).toContain("No scope recipes yet");
    expect(block).toContain("libs/util/ui/Recipe/<name>.ts");
  });
});

describe("renderScopeClaudeMd", () => {
  test("points at AGENTS.md and restates only the comment rule", () => {
    const claude = renderScopeClaudeMd({ type: "app", name: "minimal" });
    expect(claude).toContain("@AGENTS.md");
    expect(claude).toContain("## Comments — Overrides Your Default");
    expect(claude).not.toContain("## Recipes In Scope");
  });
});

describe("upsertAgentBlock / extractAgentBlock", () => {
  test("round-trips: fresh file → replace block → extract equals block", () => {
    const fresh = renderScopeAgentsMd({ type: "app", name: "minimal" }, "OLD");
    expect(extractAgentBlock(fresh)).toBe("OLD");
    const updated = upsertAgentBlock(
      fresh.replace("markers freely.", "markers freely.\n\nMy hand-written note."),
      "NEW",
    );
    expect(extractAgentBlock(updated)).toBe("NEW");
    expect(updated).toContain("My hand-written note.");
    expect(updated).not.toContain("OLD");
  });
  test("appends markers to a file that has none", () => {
    const updated = upsertAgentBlock("# hand-written\n\ncontent\n", "BLOCK");
    expect(updated).toContain("# hand-written");
    expect(updated.indexOf(AGENT_BLOCK_START)).toBeLessThan(updated.indexOf("BLOCK"));
    expect(updated.trimEnd().endsWith(AGENT_BLOCK_END)).toBe(true);
  });
});

describe("collectScopeRecipeSources", () => {
  test("collects own + dependency lib recipes, never the framework's", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "agents-index-"));
    const write = async (rel: string, content: string) => {
      await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await writeFile(path.join(root, rel), content);
    };
    await write("apps/minimal/ui/Recipe/appCard.ts", `export const appCard = recipe(tv({ base: "x" }));`);
    await write("libs/shared/ui/Recipe/panel.ts", `export const panelRecipe = recipe(tv({ base: "y" }));`);
    await write("pkgs/akanjs/ui/recipe/buttonRecipe.ts", `export const buttonRecipe = recipe(tv({ base: "z" }));`);
    const sources = await collectScopeRecipeSources(root, { type: "app", name: "minimal" }, ["shared"]);
    expect(sources.map((source) => source.importFrom).sort()).toEqual(["@apps/minimal/ui", "@libs/shared/ui"]);
  });
});

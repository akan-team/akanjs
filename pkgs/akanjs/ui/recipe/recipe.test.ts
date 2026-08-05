import { describe, expect, test } from "bun:test";
import { badgeRecipe } from "./badgeRecipe";
import { buttonRecipe } from "./buttonRecipe";
import { recipe, tv } from "./factory";

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

describe("recipe factory — buttonRecipe", () => {
  test("applies default variants when called bare", () => {
    const t = tokens(buttonRecipe());
    expect(t).toContain("bg-primary"); // default variant: primary
    expect(t).toContain("h-10"); // default size: md
  });

  test("applies the chosen variant and size", () => {
    const t = tokens(buttonRecipe({ variant: "success", size: "lg" }));
    expect(t).toContain("bg-success");
    expect(t).toContain("h-12");
    expect(t).not.toContain("bg-primary");
  });

  test("second arg appends custom classes", () => {
    expect(tokens(buttonRecipe({ variant: "primary" }, "w-full rounded-2xl"))).toEqual(
      expect.arrayContaining(["w-full", "rounded-2xl"]),
    );
  });

  test("second arg overrides a base token via tailwind-merge (semantic tokens)", () => {
    const t = tokens(buttonRecipe({ variant: "primary" }, "bg-open"));
    expect(t).toContain("bg-open");
    // base `bg-primary` is dropped; `hover:bg-primary/90` is a different token and stays.
    expect(t).not.toContain("bg-primary");
  });
});

describe("recipe factory — badgeRecipe", () => {
  test("applies variant and appends a custom class", () => {
    const t = tokens(badgeRecipe({ variant: "error" }, "ml-2"));
    expect(t).toContain("bg-destructive");
    expect(t).toContain("ml-2");
  });
});

describe("recipe factory — custom recipe(tv(...))", () => {
  const pill = recipe(
    tv({
      base: "rounded-full",
      variants: { tone: { brand: "bg-primary", ok: "bg-success" } },
      defaultVariants: { tone: "brand" },
    }),
  );

  test("chooses the requested variant", () => {
    expect(tokens(pill({ tone: "ok" }))).toContain("bg-success");
  });

  test("merges the override token like cn would", () => {
    const t = tokens(pill({ tone: "brand" }, "bg-open"));
    expect(t).toContain("bg-open");
    expect(t).not.toContain("bg-primary");
  });
});

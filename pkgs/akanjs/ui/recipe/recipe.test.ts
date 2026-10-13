import { describe, expect, test } from "bun:test";
import { cn } from "../../client/cn";
import { badgeRecipe } from "./badgeRecipe";
import { buttonRecipe } from "./buttonRecipe";
import { recipe, tv } from "./factory";
import { inputRecipe } from "./inputRecipe";

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

describe("recipe factory — buttonRecipe", () => {
  test("applies default variants when called bare", () => {
    const t = tokens(buttonRecipe());
    expect(t).toContain("bg-primary");
    expect(t).toContain("h-10");
  });

  test("applies the chosen variant and size", () => {
    const t = tokens(buttonRecipe({ variant: "success", size: "lg" }));
    expect(t).toContain("bg-success");
    expect(t).toContain("h-12");
    expect(t).not.toContain("bg-primary");
  });

  test("xl is one step past lg", () => {
    const t = tokens(buttonRecipe({ size: "xl" }));
    expect(t).toEqual(expect.arrayContaining(["h-14", "px-8", "text-xl"]));
    expect(t).not.toContain("h-12");
  });

  test("second arg appends custom classes", () => {
    expect(tokens(buttonRecipe({ variant: "primary" }, "w-full rounded-2xl"))).toEqual(
      expect.arrayContaining(["w-full", "rounded-2xl"]),
    );
  });

  test("second arg overrides a base token via tailwind-merge (semantic tokens)", () => {
    const t = tokens(buttonRecipe({ variant: "primary" }, "bg-open"));
    expect(t).toContain("bg-open");
    expect(t).not.toContain("bg-primary");
  });

  test("outline flag keeps the color: warning + outline renders a warning-colored outline", () => {
    const t = tokens(buttonRecipe({ variant: "warning", outline: true }));
    expect(t).toContain("border-warning");
    expect(t).toContain("text-warning");
    expect(t).toContain("bg-transparent");
    expect(t).not.toContain("bg-warning");
    expect(t).toContain("hover:bg-warning");
  });

  test("variant: outline stays the neutral outline (no color pairing)", () => {
    const t = tokens(buttonRecipe({ variant: "outline" }));
    expect(t).toContain("border-input");
    expect(t).toContain("bg-background");
  });

  test("shape squares the size box and circle rounds it", () => {
    const square = tokens(buttonRecipe({ shape: "square" }));
    expect(square).toContain("aspect-square");
    expect(square).not.toContain("px-4");
    const circle = tokens(buttonRecipe({ shape: "circle" }));
    expect(circle).toContain("rounded-full");
    expect(circle).not.toContain("rounded-field");
  });

  test("neutral fill exists", () => {
    expect(tokens(buttonRecipe({ variant: "neutral" }))).toContain("bg-neutral");
  });

  test("default is the muted surface, distinct from the neutral token", () => {
    const d = tokens(buttonRecipe({ variant: "default" }));
    expect(d).toContain("bg-muted");
    expect(d).toContain("text-foreground");
    expect(d).not.toContain("bg-neutral");
  });

  test("adding default does not move the bare default variant off primary", () => {
    expect(tokens(buttonRecipe())).toContain("bg-primary");
  });
});

describe("recipe factory — badgeRecipe", () => {
  test("applies variant and appends a custom class", () => {
    const t = tokens(badgeRecipe({ variant: "error" }, "ml-2"));
    expect(t).toContain("bg-destructive");
    expect(t).toContain("ml-2");
  });

  test("default size matches the former fixed padding", () => {
    const t = tokens(badgeRecipe());
    expect(t).toEqual(expect.arrayContaining(["px-2.5", "py-0.5", "text-xs"]));
  });

  test("size axis scales the pill", () => {
    expect(tokens(badgeRecipe({ size: "sm" }))).toContain("px-2");
    expect(tokens(badgeRecipe({ size: "lg" }))).toContain("text-sm");
  });

  test("outline flag keeps the color: warning + outline renders a warning-colored outline", () => {
    const t = tokens(badgeRecipe({ variant: "warning", outline: true }));
    expect(t).toContain("text-warning");
    expect(t).toContain("border-current");
    expect(t).toContain("bg-transparent");
    expect(t).not.toContain("bg-warning");
  });

  test("error + outline maps onto the destructive token", () => {
    expect(tokens(badgeRecipe({ variant: "error", outline: true }))).toContain("text-destructive");
  });

  test("variant: outline stays the neutral outline (no color pairing)", () => {
    const t = tokens(badgeRecipe({ variant: "outline" }));
    expect(t).toContain("border-border");
    expect(t).toContain("text-foreground");
  });
});

describe("recipe factory — inputRecipe", () => {
  test("default renders the former fixed shell", () => {
    const t = tokens(inputRecipe());
    expect(t).toEqual(
      expect.arrayContaining(["h-10", "px-3", "[:where(&)]:text-sm", "[:where(&)]:pointer-coarse:text-base"]),
    );
  });

  test("a caller's own text size outranks the touch floor as well as the default size", () => {
    for (const size of ["xs", "sm", "md"] as const) {
      const t = tokens(cn(inputRecipe({ size }), "text-2xl"));
      const sizing = t.filter((token) => /(^|:)text-(xs|sm|base|lg|\d?xl)$/.test(token) && token !== "text-2xl");
      expect(t).toContain("text-2xl");
      expect(sizing).toContain("[:where(&)]:pointer-coarse:text-base");
      expect(sizing.every((token) => token.startsWith("[:where(&)]:"))).toBe(true);
    }
  });

  test("size sets the field height through the kind compound", () => {
    const t = tokens(inputRecipe({ size: "lg" }));
    expect(t).toContain("h-12");
    expect(t).toContain("text-base");
  });

  test("area never takes a height — a textarea sizes from its content", () => {
    const t = tokens(inputRecipe({ kind: "area", size: "lg" }));
    expect(t).not.toContain("h-12");
    expect(t).toContain("text-base");
  });

  test("select draws its own chevron over the surface and takes h-10 at md", () => {
    const t = tokens(inputRecipe({ kind: "select", size: "md" }));
    expect(t).toEqual(expect.arrayContaining(["appearance-none", "bg-no-repeat", "pr-7", "pl-3", "h-10"]));
    expect(t.some((token) => token.startsWith("bg-[image:"))).toBe(true);
    expect(t).toContain("bg-background");
    expect(t).not.toContain("px-3");
  });

  test("select shares the field height at every size, and area still takes none", () => {
    const heightsOf = (classes: string) => tokens(classes).filter((token) => /^h-\d+$/.test(token));
    for (const size of ["xs", "sm", "md", "lg", "xl"] as const) {
      const field = heightsOf(inputRecipe({ kind: "field", size }));
      expect(field).toHaveLength(1);
      expect(heightsOf(inputRecipe({ kind: "select", size }))).toEqual(field);
      expect(heightsOf(inputRecipe({ kind: "area", size }))).toEqual([]);
    }
  });

  test("error tone swaps the border to destructive", () => {
    const t = tokens(inputRecipe({ tone: "error" }));
    expect(t).toContain("border-destructive");
    expect(t).not.toContain("border-input");
    expect(t).toContain("focus:border-destructive");
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

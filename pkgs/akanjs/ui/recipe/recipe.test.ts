import { describe, expect, test } from "bun:test";
import { badgeRecipe } from "./badgeRecipe";
import { buttonRecipe } from "./buttonRecipe";
import { recipe, tv } from "./factory";
import { inputRecipe } from "./inputRecipe";

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

  test("outline flag keeps the color: warning + outline renders a warning-colored outline", () => {
    const t = tokens(buttonRecipe({ variant: "warning", outline: true }));
    expect(t).toContain("border-warning");
    expect(t).toContain("text-warning");
    expect(t).toContain("bg-transparent");
    expect(t).not.toContain("bg-warning"); // solid fill is dropped, hover:bg-warning remains
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
    expect(square).not.toContain("px-4"); // size padding is dropped by px-0
    const circle = tokens(buttonRecipe({ shape: "circle" }));
    expect(circle).toContain("rounded-full");
    expect(circle).not.toContain("rounded-field");
  });

  test("neutral fill exists", () => {
    expect(tokens(buttonRecipe({ variant: "neutral" }))).toContain("bg-neutral");
  });

  // daisyUI's bare `.btn` resolved to base-200 while `.btn-neutral` resolved to --color-neutral, and
  // both were used side by side, so the muted surface and the neutral token must stay separate fills.
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
    expect(t).not.toContain("bg-warning"); // the solid fill is dropped, the color survives
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
    expect(t).toEqual(expect.arrayContaining(["h-10", "px-3", "text-sm"]));
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

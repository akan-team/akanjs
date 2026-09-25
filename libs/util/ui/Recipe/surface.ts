import { recipe, tv } from "akanjs/ui";

/**
 * Card shell. daisyUI's `.card` was `border-radius: var(--radius-box)` plus `relative; display:flex;
 * flex-direction:column` — the call sites already bring their own border and background, so `surface`
 * defaults to adding neither.
 */
export const cardRecipe = recipe(
  tv({
    base: "relative flex flex-col rounded-box",
    variants: {
      surface: { none: "", bordered: "border border-border bg-card", filled: "bg-card" },
      // daisyUI's card-sm/lg scaled the body padding; the card itself only carries the radius, so the
      // size axis exists to keep those call sites expressible rather than to change the shell.
      size: { sm: "rounded-field", md: "", lg: "" },
    },
    defaultVariants: { surface: "none", size: "md" },
  }),
);
export type CardVariants = NonNullable<Parameters<typeof cardRecipe>[0]>;

/**
 * Alert bar. Mirrors daisyUI's grid-flow-col layout and padding; the tinted variants replace
 * `alert-info`/`alert-success`/`alert-warning`/`alert-error`.
 */
export const alertRecipe = recipe(
  tv({
    base: "grid auto-cols-auto grid-flow-col items-center justify-start gap-4 rounded-box border px-4 py-3 text-start text-sm",
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground",
        info: "border-info/30 bg-info/15 text-foreground",
        success: "border-success/30 bg-success/15 text-foreground",
        warning: "border-warning/30 bg-warning/15 text-foreground",
        error: "border-destructive/30 bg-destructive/15 text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }),
);
export type AlertVariants = NonNullable<Parameters<typeof alertRecipe>[0]>;

/**
 * Table. daisyUI styled cells through descendant selectors, which a utility recipe can only reach with
 * arbitrary variants — hence the `[&_:is(th,td)]:` prefixes. Keeping them here means the call sites stay a
 * plain `<table className={tableRecipe()}>` with no per-cell classes.
 */
export const tableRecipe = recipe(
  tv({
    base: [
      "relative w-full border-separate border-spacing-0 rounded-box text-left text-sm",
      "[&_:is(th,td)]:align-middle",
      "[&_:is(thead,tfoot)]:whitespace-nowrap [&_:is(thead,tfoot)]:font-semibold [&_:is(thead,tfoot)]:text-muted-foreground",
    ].join(" "),
    variants: {
      size: {
        sm: "text-xs [&_:is(th,td)]:px-3 [&_:is(th,td)]:py-2",
        md: "[&_:is(th,td)]:px-4 [&_:is(th,td)]:py-3",
      },
    },
    defaultVariants: { size: "md" },
  }),
);
export type TableVariants = NonNullable<Parameters<typeof tableRecipe>[0]>;

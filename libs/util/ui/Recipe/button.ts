import { recipe, tv } from "akanjs/ui";

/**
 * Workspace button look. Extends akanjs's `buttonRecipe` vocabulary with the two axes daisyUI had and
 * the framework recipe does not: a `neutral` fill, and the square/circle icon shapes.
 *
 * Kept as a recipe rather than routed through `<Button>` because only 422 of the 627 former `btn` call
 * sites are actually `<button>` — the rest sit on `<Link>`, `<Tab.Menu>`, `<label>` and `<Model.*>`,
 * which take a className and cannot be swapped for a component.
 *
 * Server-safe: never add "use client" here.
 */
export const buttonRecipe = recipe(
  tv({
    // The radius lives on `shape`, not here. akanjs 3.0.0-alpha.2's tailwind-merge is extended with the
    // color tokens but not the radius ones, so `rounded-field` in the base and `rounded-full` on
    // `shape: circle` do NOT merge — both survive and stylesheet order picks the winner, leaving circle
    // buttons not reliably round. Emitting exactly one radius per shape sidesteps the merge entirely.
    // The framework fix (radiusTokens in cn.ts + factory.ts) produces the same output, so this stays
    // correct after the swap to akanjs/ui.
    base: "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    variants: {
      variant: {
        // daisyUI's bare `.btn` was `--btn-bg: var(--btn-color, var(--color-base-200))` with
        // `--btn-fg: var(--color-base-content)` — a muted button, not a primary one. The framework
        // recipe follows shadcn instead, where the unnamed default IS primary and there is no neutral
        // fill at all (its `badgeRecipe` does have one, which is the asymmetry). Every `btn` with no
        // colour modifier lands here, so this has to be the default variant.
        default: "bg-muted text-foreground hover:bg-muted/80",
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        accent: "bg-accent text-accent-foreground hover:bg-accent/90",
        neutral: "bg-neutral text-neutral-foreground hover:bg-neutral/90",
        outline: "border border-input bg-background hover:bg-muted hover:text-foreground",
        ghost: "hover:bg-muted hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        success: "bg-success text-success-foreground hover:bg-success/90",
        warning: "bg-warning text-warning-foreground hover:bg-warning/90",
        info: "bg-info text-info-foreground hover:bg-info/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-6 px-2 text-xs",
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-lg",
        xl: "h-14 px-8 text-xl",
        icon: "h-10 w-10",
      },
      // daisyUI sized these off the button height; `size` already sets h-*, so squaring the aspect is
      // enough and keeps xs/sm/lg square buttons correct without a shape×size matrix.
      shape: {
        default: "rounded-field",
        square: "aspect-square rounded-field px-0",
        circle: "aspect-square rounded-full px-0",
      },
      // daisyUI's `btn-outline` is a style modifier, not a color: `btn-warning btn-outline` is a
      // warning-colored outline. Modelling it as a variant value would silently drop the color, so it
      // gets its own axis and the color pairing lives in compoundVariants below.
      outline: { true: "border bg-transparent", false: "" },
    },
    compoundVariants: [
      {
        variant: "default",
        outline: true,
        class: "border-border text-foreground hover:bg-muted hover:text-foreground",
      },
      {
        variant: "primary",
        outline: true,
        class: "border-primary text-primary hover:bg-primary hover:text-primary-foreground",
      },
      {
        variant: "secondary",
        outline: true,
        class: "border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground",
      },
      {
        variant: "accent",
        outline: true,
        class: "border-accent text-accent hover:bg-accent hover:text-accent-foreground",
      },
      {
        variant: "neutral",
        outline: true,
        class: "border-neutral text-neutral hover:bg-neutral hover:text-neutral-foreground",
      },
      {
        variant: "destructive",
        outline: true,
        class: "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground",
      },
      {
        variant: "success",
        outline: true,
        class: "border-success text-success hover:bg-success hover:text-success-foreground",
      },
      {
        variant: "warning",
        outline: true,
        class: "border-warning text-warning hover:bg-warning hover:text-warning-foreground",
      },
      { variant: "info", outline: true, class: "border-info text-info hover:bg-info hover:text-info-foreground" },
    ],
    defaultVariants: { variant: "default", size: "md", shape: "default", outline: false },
  }),
);
export type ButtonVariants = NonNullable<Parameters<typeof buttonRecipe>[0]>;

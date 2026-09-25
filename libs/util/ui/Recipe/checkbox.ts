import { recipe, tv } from "akanjs/ui";

/**
 * Checkbox. daisyUI drew its own box with `appearance: none` plus a clip-path tick; this keeps the
 * native control and tints it with `accent-color`, which gets the same shape family (bordered square
 * when unchecked, filled with a white tick when checked) for one utility instead of a dozen.
 *
 * Sizes are daisyUI's `--size: calc(var(--size-selector) * N)` with `--size-selector` at its .25rem
 * default, so `md` is the 1.5rem box `.checkbox` had.
 *
 * `tone` names a *palette colour*, not a semantic pair — Tailwind's `accent-<colour>` resolves against
 * the colour namespace, so `accent-foreground` is `accent-color: var(--color-foreground)` and NOT the
 * `--accent-foreground` token. `default` is daisyUI's uncoloured `.checkbox`, whose checked fill was
 * `color-mix(base-content 50%, transparent)`.
 *
 * akanjs's own `Input.Checkbox` still emits the daisyUI `checkbox` class, which nothing defines once
 * the plugin is gone — that is why this exists rather than routing the call sites through it.
 *
 * Server-safe: never add "use client" here.
 */
export const checkboxRecipe = recipe(
  tv({
    base: "shrink-0 cursor-pointer",
    variants: {
      size: { xs: "size-4", sm: "size-5", md: "size-6", lg: "size-7" },
      tone: {
        default: "accent-foreground/50",
        primary: "accent-primary",
        secondary: "accent-secondary",
        accent: "accent-accent",
        success: "accent-success",
        warning: "accent-warning",
        error: "accent-destructive",
      },
    },
    defaultVariants: { size: "md", tone: "default" },
  }),
);
export type CheckboxVariants = NonNullable<Parameters<typeof checkboxRecipe>[0]>;

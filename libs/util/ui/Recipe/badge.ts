import { recipe, tv } from "akanjs/ui";

/**
 * Workspace badge look. Same variants as akanjs's `badgeRecipe` plus the size axis daisyUI had
 * (`badge-xs/sm/md/lg`), which the framework recipe does not carry.
 *
 * `ghost` is intentionally absent: daisyUI's `badge-ghost` was a muted fill with no border, which is
 * exactly what `default` already is — the 10 former `badge-ghost` sites map onto it.
 *
 * Server-safe: never add "use client" here.
 */
export const badgeRecipe = recipe(
  tv({
    base: "inline-flex items-center gap-1 rounded-full border font-medium",
    variants: {
      variant: {
        default: "border-transparent bg-muted text-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        accent: "border-transparent bg-accent text-accent-foreground",
        neutral: "border-transparent bg-neutral text-neutral-foreground",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        info: "border-transparent bg-info text-info-foreground",
        error: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground",
      },
      size: {
        xs: "px-1.5 py-0 text-[0.625rem]",
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
      // `.badge-outline` was `color: var(--badge-color); --badge-bg: #0000; border-color: currentColor`
      // — a style modifier over whatever colour `.badge-<colour>` had set, so `badge-outline
      // badge-warning` is a warning-coloured outline. Same shape as the button's `outline` axis, and
      // for the same reason: folding it into `variant` would silently drop the colour.
      // `variant: "outline"` stays as the uncoloured outline, which is what most sites want.
      outline: { true: "bg-transparent", false: "" },
    },
    compoundVariants: [
      { variant: "default", outline: true, class: "border-border text-foreground" },
      { variant: "primary", outline: true, class: "border-primary text-primary" },
      { variant: "secondary", outline: true, class: "border-secondary text-secondary" },
      { variant: "accent", outline: true, class: "border-accent text-accent" },
      { variant: "neutral", outline: true, class: "border-neutral text-neutral" },
      { variant: "success", outline: true, class: "border-success text-success" },
      { variant: "warning", outline: true, class: "border-warning text-warning" },
      { variant: "info", outline: true, class: "border-info text-info" },
      { variant: "error", outline: true, class: "border-destructive text-destructive" },
    ],
    defaultVariants: { variant: "default", size: "md", outline: false },
  }),
);
export type BadgeVariants = NonNullable<Parameters<typeof badgeRecipe>[0]>;

import { recipe, tv } from "akanjs/ui";

/**
 * Input surface — the shell shared by `<input>`, `<textarea>` and `<select>`.
 *
 * akanjs ships an `inputRecipe` already, but only with a `kind` axis. daisyUI's inputs carried a size
 * (`input-sm`, `select-sm`), and dropping it would silently resize 39 fields, so this adds `size` back.
 * Height belongs to `kind: "field"` only — a textarea sizes itself from its content and its own `min-h-*`.
 *
 * Server-safe: never add "use client" here.
 */
export const inputRecipe = recipe(
  tv({
    base: "w-full rounded-field border border-input bg-background text-foreground focus:border-primary focus:outline-none",
    variants: {
      kind: { field: "px-3", area: "p-3" },
      size: { xs: "text-xs", sm: "text-sm", md: "text-sm", lg: "text-base", xl: "text-lg" },
      tone: { default: "", primary: "border-primary" },
    },
    compoundVariants: [
      { kind: "field", size: "xs", class: "h-6" },
      { kind: "field", size: "sm", class: "h-8" },
      { kind: "field", size: "md", class: "h-10" },
      { kind: "field", size: "lg", class: "h-12" },
      { kind: "field", size: "xl", class: "h-14" },
    ],
    defaultVariants: { kind: "field", size: "md", tone: "default" },
  }),
);
export type InputVariants = NonNullable<Parameters<typeof inputRecipe>[0]>;

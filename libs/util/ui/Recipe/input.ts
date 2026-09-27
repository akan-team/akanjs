import { recipe, tv } from "akanjs/ui";

/**
 * Input surface — the shell shared by `<input>`, `<textarea>` and `<select>`.
 *
 * akanjs ships an `inputRecipe` already, but only with a `kind` axis. daisyUI's inputs carried a size
 * (`input-sm`, `select-sm`), and dropping it would silently resize 39 fields, so this adds `size` back.
 * Height belongs to `kind: "field"` and `"select"` — a textarea sizes itself from its content and its own `min-h-*`.
 * `kind: "select"` draws its own chevron: the browser's native arrow ignores `padding-right` and sits on the border.
 * Each arm is a 2px band laid inside one diagonal of a 5×6px tile, so the two tiles meet in the native chevron's point.
 *
 * Server-safe: never add "use client" here.
 */
export const inputRecipe = recipe(
  tv({
    base: "w-full rounded-field border border-input bg-background text-foreground focus:border-primary focus:outline-none",
    variants: {
      kind: {
        field: "px-3",
        area: "p-3",
        select:
          "appearance-none bg-[image:linear-gradient(to_top_right,transparent_50%,currentColor_50%,currentColor_calc(50%+2px),transparent_calc(50%+2px)),linear-gradient(to_bottom_right,transparent_calc(50%-2px),currentColor_calc(50%-2px),currentColor_50%,transparent_50%)] bg-[length:5px_6px] bg-[position:calc(100%-14px)_50%,calc(100%-9px)_50%] bg-no-repeat pr-7 pl-3",
      },
      size: { xs: "text-xs", sm: "text-sm", md: "text-sm", lg: "text-base", xl: "text-lg" },
      tone: { default: "", primary: "border-primary" },
    },
    compoundVariants: [
      { kind: ["field", "select"], size: "xs", class: "h-6" },
      { kind: ["field", "select"], size: "sm", class: "h-8" },
      { kind: ["field", "select"], size: "md", class: "h-10" },
      { kind: ["field", "select"], size: "lg", class: "h-12" },
      { kind: ["field", "select"], size: "xl", class: "h-14" },
    ],
    defaultVariants: { kind: "field", size: "md", tone: "default" },
  }),
);
export type InputVariants = NonNullable<Parameters<typeof inputRecipe>[0]>;

import { recipe, tv } from "akanjs/ui";

/**
 * Disclosure built on a peer checkbox, so both states stay server-rendered — the shape daisyUI's
 * `.collapse` had, kept because the markup already exists at every call site.
 *
 * The animation is `grid-template-rows: auto 0fr -> auto 1fr`: a height transition needs a fixed
 * target height, and `0fr` is the only way to animate to content height without measuring it.
 *
 * Markup contract, in order: `<input type="checkbox" className="peer" />`, the title, the content.
 * The input must come first — `peer-checked:` only reaches later siblings.
 *
 * Server-safe: never add "use client" here.
 */
export const collapseClass =
  "relative grid grid-rows-[auto_0fr] overflow-hidden transition-[grid-template-rows] duration-200 has-[:checked]:grid-rows-[auto_1fr] [&>input]:col-start-1 [&>input]:row-start-1 [&>input]:size-full [&>input]:cursor-pointer [&>input]:appearance-none [&>input]:opacity-0";

export const collapseTitleRecipe = recipe(
  tv({
    base: "col-start-1 row-start-1 p-4",
    variants: {
      arrow: {
        true: "after:absolute after:top-6 after:right-6 after:size-2 after:rotate-45 after:border-current after:border-r-2 after:border-b-2 after:transition-transform after:content-[''] peer-checked:after:rotate-[225deg]",
        false: "",
      },
    },
    defaultVariants: { arrow: false },
  }),
);

export const collapseContentClass = "col-start-1 row-start-2 min-h-0 overflow-hidden px-4";

import { recipe, tv } from "akanjs/ui";

/**
 * Tab item. akanjs's `<Tab.Menus>` and `<Tab.Menu>` render bare `div`s and only merge the classes
 * they are handed, so daisyUI's `.tab` was the entire look and has to be reproduced here.
 *
 * Geometry is daisyUI's: `--tab-height: calc(var(--size-field) * 10)` (2.5rem) and `--tab-p: .75rem`.
 * The colour axis is the one thing `.tab` did with a selector rather than a class — an item that is
 * neither active nor hovered rendered at `color-mix(base-content 50%, transparent)`. Here that is the
 * `active: false` value, and `<Tab.Menu>` appends `activeClassName` last so it wins the merge.
 *
 * `tabs-bordered` / `tabs-lifted` are deliberately absent. Those are daisyUI 4 names; 5.5.19 ships
 * `tabs-border` / `tabs-lift`, so the class strings carrying them had never matched a rule. The
 * container itself is one utility pair (`flex flex-wrap`) and stays inline at the call sites.
 *
 * Server-safe: never add "use client" here.
 */
/**
 * The `active: true` delta on its own, for `<Tab.Menu activeClassName>`. That prop is *appended* to
 * `className`, so it must carry only the delta — handing it the whole recipe would also re-apply the
 * base and clobber the call site's own `h-*`/`px-*` overrides, since the later class wins the merge.
 */
export const tabActiveClass = "text-foreground";

/** daisyUI's `.tab-disabled`, which was `pointer-events: none` at 40% opacity. */
export const tabDisabledClass = "pointer-events-none opacity-40";

export const tabRecipe = recipe(
  tv({
    base: "relative inline-flex h-10 cursor-pointer select-none flex-wrap items-center justify-center border-transparent px-3 text-center text-sm hover:text-foreground",
    variants: {
      active: {
        true: tabActiveClass,
        false: "text-foreground/50",
      },
    },
    defaultVariants: { active: false },
  }),
);
export type TabVariants = NonNullable<Parameters<typeof tabRecipe>[0]>;

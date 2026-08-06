import { recipe, tv } from "akanjs/ui";

/** 카드/셀 그리드 — `grid gap-3` 위에 cols 브레이크포인트를 얹는다. */
export const cardGridRecipe = recipe(
  tv({
    base: "grid gap-3",
    variants: {
      cols: { two: "xl:grid-cols-2", three: "xl:grid-cols-3", mdTwo: "md:grid-cols-2" },
    },
    defaultVariants: { cols: "two" },
  }),
);
export type CardGridVariants = NonNullable<Parameters<typeof cardGridRecipe>[0]>;

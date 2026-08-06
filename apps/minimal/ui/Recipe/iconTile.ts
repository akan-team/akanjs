import { recipe, tv } from "akanjs/ui";

/** 아이콘 타일 — 토큰 배경 위 아이콘. size 로 사각 크기와 글자 스케일을 함께 잡는다. */
export const iconTileRecipe = recipe(
  tv({
    base: "flex items-center justify-center rounded-2xl bg-primary/15 text-primary",
    variants: {
      size: {
        sm: "h-10 w-10 text-xl",
        md: "h-11 w-11 text-xl",
        lg: "h-12 w-12 text-2xl",
        xl: "h-14 w-14 text-3xl",
      },
    },
    defaultVariants: { size: "md" },
  }),
);
export type IconTileVariants = NonNullable<Parameters<typeof iconTileRecipe>[0]>;

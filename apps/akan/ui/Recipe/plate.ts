import { recipe, tv } from "akanjs/ui";

/** 모서리 재단 표식 판 — 테두리 없이 `crop-marks` 네 모서리와 옅은 바탕만 남긴 표면. primary 는 표식·바탕을 강조색으로. */
export const plateRecipe = recipe(
  tv({
    base: "crop-marks relative bg-foreground/3",
    variants: {
      tone: { plain: "", primary: "marks-primary bg-primary/5" },
      padding: { md: "p-5 md:p-6", lg: "p-6 md:p-10" },
    },
    defaultVariants: { tone: "plain", padding: "md" },
  }),
);
export type PlateVariants = NonNullable<Parameters<typeof plateRecipe>[0]>;

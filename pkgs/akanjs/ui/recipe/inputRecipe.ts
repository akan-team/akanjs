import { recipe, tv } from "./factory";

/** 입력 표면 look — Input/TextArea 가 공유하는 필드 셸. kind 로 한 줄 필드(field)/멀티라인(area)을 고른다. */
export const inputRecipe = recipe(
  tv({
    base: "w-full rounded-field border border-input bg-background text-foreground text-sm focus:border-primary focus:outline-none",
    variants: {
      kind: { field: "h-10 px-3", area: "p-3" },
    },
    defaultVariants: { kind: "field" },
  }),
);
export type InputSurfaceVariants = NonNullable<Parameters<typeof inputRecipe>[0]>;

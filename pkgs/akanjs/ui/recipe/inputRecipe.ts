import { recipe, tv } from "./factory";

/** 입력 표면 look — Input/TextArea/Select 가 공유하는 필드 셸. kind 로 한 줄 필드(field)/멀티라인(area), tone 으로 강조/오류 상태를 고른다. */
export const inputRecipe = recipe(
  tv({
    base: "w-full rounded-field border border-input bg-background text-foreground focus:border-primary focus:outline-none",
    variants: {
      kind: { field: "px-3", area: "p-3" },
      size: { xs: "text-xs", sm: "text-sm", md: "text-sm", lg: "text-base", xl: "text-lg" },
      tone: {
        default: "",
        primary: "border-primary",
        error: "border-destructive focus:border-destructive",
      },
    },
    // Height belongs to `kind: "field"` only — a textarea sizes itself from its content and its own
    // min-h-*, so size cannot be a flat h-* per value.
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
export type InputSurfaceVariants = NonNullable<Parameters<typeof inputRecipe>[0]>;

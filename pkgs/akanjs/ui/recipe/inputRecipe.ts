import { recipe, tv } from "./factory";

/** 입력 표면 look — Input/TextArea/DatePicker 가 공유하는 필드 셸. kind 로 한 줄 필드(field)/멀티라인(area)/네이티브 `<select>`(select), tone 으로 강조/오류 상태를 고른다. */
export const inputRecipe = recipe(
  tv({
    base: "w-full rounded-field border border-input bg-background text-foreground focus:border-primary focus:outline-none",
    variants: {
      kind: {
        field: "px-3",
        area: "p-3",
        // The native arrow ignores padding-right and sits on the border, so two tiles of 2px diagonal bands draw one.
        select:
          "appearance-none bg-[image:linear-gradient(to_top_right,transparent_50%,currentColor_50%,currentColor_calc(50%+2px),transparent_calc(50%+2px)),linear-gradient(to_bottom_right,transparent_calc(50%-2px),currentColor_calc(50%-2px),currentColor_50%,transparent_50%)] bg-[length:5px_6px] bg-[position:calc(100%-14px)_50%,calc(100%-9px)_50%] bg-no-repeat pr-7 pl-3",
      },
      // iOS zooms the page into a focused field set under 16px, so a touch screen gets at least that. Both sit under
      // `:where()`: tailwind-merge keeps a variant class beside a caller's `text-*`, which wins on specificity alone.
      size: {
        xs: "[:where(&)]:text-xs [:where(&)]:pointer-coarse:text-base",
        sm: "[:where(&)]:text-sm [:where(&)]:pointer-coarse:text-base",
        md: "[:where(&)]:text-sm [:where(&)]:pointer-coarse:text-base",
        lg: "text-base",
        xl: "text-lg",
      },
      tone: {
        default: "",
        primary: "border-primary",
        error: "border-destructive focus:border-destructive",
      },
    },
    // Height is `field` and `select` only: a textarea sizes itself from its content and its own min-h-*.
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
export type InputSurfaceVariants = NonNullable<Parameters<typeof inputRecipe>[0]>;

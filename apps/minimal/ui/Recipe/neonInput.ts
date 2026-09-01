import { recipe, tv } from "akanjs/ui";

/**
 * 네온 입력 표면 스킨 — 프레임워크 inputRecipe 의 **look 교체용**.
 * kind/size/tone 표면을 inputRecipe 와 동일하게 유지해야 `recipes.input` 슬롯에 주입 가능하다
 * (Input/TextArea/Select 가 같은 셸을 공유하므로). 아래쪽 한 줄만 남긴 터미널풍 필드 + 포커스 글로우.
 * 높이는 field 에만 붙는다 — textarea 는 내용으로 자란다.
 */
export const neonInputRecipe = recipe(
  tv({
    base: "w-full rounded-none border-0 border-b-2 border-muted-foreground bg-transparent font-mono text-foreground transition focus:border-primary focus:shadow-[0_2px_10px_-4px] focus:shadow-primary/60 focus:outline-none",
    variants: {
      kind: { field: "px-2", area: "p-2" },
      size: { xs: "text-xs", sm: "text-sm", md: "text-sm", lg: "text-base", xl: "text-lg" },
      tone: {
        default: "",
        primary: "border-primary",
        error: "border-destructive focus:border-destructive focus:shadow-destructive/60",
      },
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
export type NeonInputVariants = NonNullable<Parameters<typeof neonInputRecipe>[0]>;

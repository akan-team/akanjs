import { recipe, tv } from "akanjs/ui";

/**
 * 콘텐츠 표면 패널 — `rounded-* border bg-background p-*` 계열 통합. row 는 리스트/행 표면(px만).
 * radius/padding 의 `none` 은 모서리·여백을 끄고 호출부에서 인라인으로 지정할 때(메뉴에 없는 조합).
 */
export const panelRecipe = recipe(
  tv({
    base: "border",
    variants: {
      tone: {
        solid: "border-border bg-background",
        glass: "border-foreground/10 bg-foreground/4 backdrop-blur",
      },
      radius: { none: "", lg: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl" },
      padding: { none: "", sm: "p-3", md: "p-4", lg: "p-5", xl: "p-8", row: "px-4 py-0" },
      shadow: { true: "shadow-md" },
    },
    defaultVariants: { tone: "solid", radius: "xl", padding: "md" },
  }),
);
export type PanelVariants = NonNullable<Parameters<typeof panelRecipe>[0]>;

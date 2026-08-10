import { recipe, tv } from "akanjs/ui";

/**
 * 네온 뱃지 스킨 — 프레임워크 badgeRecipe 의 **look 교체용**.
 * variant/size/outline 표면을 badgeRecipe 와 동일하게 유지해야 `recipes.badge` 슬롯에 주입 가능하다
 * (호출부가 넘기는 모든 variant 를 받아야 하므로). 채움 대신 각진 외곽선 + 모노 대문자로 간다.
 * 스킨 자체가 이미 외곽선이라 outline 플래그는 글로우만 한 단계 죽이는 용도로 받는다.
 */
export const neonBadgeRecipe = recipe(
  tv({
    base: "inline-flex items-center gap-1 rounded-none border bg-transparent font-mono uppercase tracking-widest",
    variants: {
      variant: {
        default: "border-muted-foreground text-muted-foreground",
        primary: "border-primary text-primary shadow-[0_0_8px] shadow-primary/40",
        secondary: "border-secondary text-secondary",
        accent: "border-accent text-accent shadow-[0_0_8px] shadow-accent/40",
        neutral: "border-neutral text-neutral",
        success: "border-success text-success shadow-[0_0_8px] shadow-success/40",
        warning: "border-warning text-warning shadow-[0_0_8px] shadow-warning/40",
        info: "border-info text-info",
        error: "border-destructive text-destructive shadow-[0_0_8px] shadow-destructive/40",
        outline: "border-border text-foreground",
      },
      size: {
        xs: "px-1.5 py-0 text-[0.625rem]",
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
      outline: { true: "shadow-none" },
    },
    defaultVariants: { variant: "default", size: "md" },
  }),
);
export type NeonBadgeVariants = NonNullable<Parameters<typeof neonBadgeRecipe>[0]>;

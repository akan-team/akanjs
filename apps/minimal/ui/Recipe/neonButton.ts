import { recipe, tv } from "akanjs/ui";

/**
 * 네온/사이버펑크 버튼 스킨 — 프레임워크 buttonRecipe 의 **look 교체용**.
 * variant/size/shape/outline 표면을 buttonRecipe 와 동일하게 유지해야 `recipes.button` 슬롯에 주입 가능하다
 * (호출부가 넘기는 모든 variant 를 받아야 하므로). 각지고(rounded-none)·아웃라인·글로우·모노 대문자.
 * 스킨 자체가 이미 아웃라인이라 outline 플래그는 no-op 로 받기만 한다.
 * `_overrides.tsx` 에서 `override({ recipes: { button: neonButtonRecipe } })` 로 주입하면,
 * 그 라우트 서브트리의 모든 <Button> 이 동작(로딩→성공)은 그대로 둔 채 이 스킨으로 렌더된다.
 */
export const neonButtonRecipe = recipe(
  tv({
    base: "inline-flex items-center justify-center gap-2 rounded-none border-2 bg-transparent font-mono uppercase tracking-widest transition active:scale-95",
    variants: {
      variant: {
        default: "border-muted-foreground text-muted-foreground hover:bg-muted hover:text-foreground",
        primary:
          "border-primary text-primary hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_14px] hover:shadow-primary/60",
        secondary: "border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground",
        accent: "border-accent text-accent hover:bg-accent hover:text-accent-foreground",
        neutral: "border-neutral text-neutral hover:bg-neutral hover:text-neutral-foreground",
        outline: "border-border text-foreground hover:bg-muted",
        ghost: "border-transparent text-foreground hover:bg-muted",
        destructive:
          "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_0_14px] hover:shadow-destructive/60",
        success: "border-success text-success hover:bg-success hover:text-success-foreground",
        warning: "border-warning text-warning hover:bg-warning hover:text-warning-foreground",
        info: "border-info text-info hover:bg-info hover:text-info-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-6 px-2 text-xs",
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-lg",
        icon: "h-10 w-10",
      },
      shape: {
        default: "",
        square: "aspect-square px-0",
        circle: "aspect-square rounded-full px-0",
      },
      outline: { true: "" },
    },
    defaultVariants: { variant: "primary", size: "md", shape: "default" },
  }),
);

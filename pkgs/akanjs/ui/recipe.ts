import { recipe, tv } from "./recipeFactory";

/**
 * recipe 레이어 — 프리미티브의 스타일 recipe(변형)를 모으는 **서버-안전** 모듈.
 * **여기엔 절대 `"use client"` 를 붙이지 않는다.** 팩토리(`recipe`/`tv`)는 `./recipeFactory` 에 있다.
 *
 * 호출 규격: `xRecipe(변형객체, 커스텀클래스?)`. 두 번째 인자 className 은 recipe 안에서 tailwind-merge 로
 * 자동 병합되므로 호출부에서 `cn(...)` 으로 감쌀 필요가 없다:
 *   buttonRecipe({ variant: "primary" }, "w-full rounded-2xl")   // ✅ cn 불필요
 *
 * 새 프리미티브 변형은 컴포넌트 파일이 아니라 **여기에** `export const xRecipe = recipe(tv({ base, variants }))`
 * 로 추가한다. 레이어: styles.css(토큰) → recipe(변형) → 컴포넌트(동작).
 */

export const buttonRecipe = recipe(
  tv({
    base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-field font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        accent: "bg-accent text-accent-foreground hover:bg-accent/90",
        outline: "border border-input bg-background hover:bg-muted hover:text-foreground",
        ghost: "hover:bg-muted hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        success: "bg-success text-success-foreground hover:bg-success/90",
        warning: "bg-warning text-warning-foreground hover:bg-warning/90",
        info: "bg-info text-info-foreground hover:bg-info/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-6 px-2 text-xs",
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }),
);
export type ButtonVariants = NonNullable<Parameters<typeof buttonRecipe>[0]>;

export const badgeRecipe = recipe(
  tv({
    base: "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium text-xs",
    variants: {
      variant: {
        default: "border-transparent bg-muted text-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        accent: "border-transparent bg-accent text-accent-foreground",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        info: "border-transparent bg-info text-info-foreground",
        error: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }),
);
export type BadgeVariants = NonNullable<Parameters<typeof badgeRecipe>[0]>;

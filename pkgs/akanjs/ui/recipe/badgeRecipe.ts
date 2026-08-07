import { recipe, tv } from "./factory";

/** 뱃지 look — 시맨틱 variant × size, outline 플래그는 색을 유지한 외곽선 스타일. `<Badge>` 가 소비하며, recipes.badge 슬롯으로 교체 가능. */
export const badgeRecipe = recipe(
  tv({
    base: "inline-flex items-center gap-1 rounded-full border font-medium",
    variants: {
      variant: {
        default: "border-transparent bg-muted text-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        accent: "border-transparent bg-accent text-accent-foreground",
        neutral: "border-transparent bg-neutral text-neutral-foreground",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        info: "border-transparent bg-info text-info-foreground",
        error: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground",
      },
      size: {
        xs: "px-1.5 py-0 text-[0.625rem]",
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
      // An outlined *colored* badge cannot be a `variant` value: only one value can be chosen, so it
      // would silently drop the color. The border follows the text color, so each color only needs to
      // restate its own foreground in compoundVariants. `variant: "outline"` stays as the neutral outline.
      outline: { true: "border-current bg-transparent" },
    },
    compoundVariants: [
      { variant: "primary", outline: true, class: "text-primary" },
      { variant: "secondary", outline: true, class: "text-secondary" },
      { variant: "accent", outline: true, class: "text-accent" },
      { variant: "neutral", outline: true, class: "text-neutral" },
      { variant: "success", outline: true, class: "text-success" },
      { variant: "warning", outline: true, class: "text-warning" },
      { variant: "info", outline: true, class: "text-info" },
      { variant: "error", outline: true, class: "text-destructive" },
    ],
    defaultVariants: { variant: "default", size: "md" },
  }),
);
export type BadgeVariants = NonNullable<Parameters<typeof badgeRecipe>[0]>;

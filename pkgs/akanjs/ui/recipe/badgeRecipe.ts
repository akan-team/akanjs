import { recipe, tv } from "./factory";

/** 뱃지 look — 시맨틱 variant. `<Badge>` 가 소비하며, recipes.badge 슬롯으로 교체 가능. */
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

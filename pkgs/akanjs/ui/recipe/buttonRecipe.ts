import { recipe, tv } from "./factory";

/** 버튼 look — 시맨틱 variant × size. `<Button>` 이 소비하며, `_overrides.tsx` 의 recipes.button 슬롯으로 교체 가능. */
export const buttonRecipe = recipe(
  tv({
    // `transition` (not transition-colors) so the active-press scale animates too — without press feedback a
    // synchronous button gives no sign at all that it was clicked. `disabled:pointer-events-none` already
    // suppresses :active, so the press state needs no disabled counterpart.
    base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-field font-medium transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
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

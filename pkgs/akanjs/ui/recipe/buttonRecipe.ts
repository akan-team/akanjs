import { recipe, tv } from "./factory";

/** 버튼 look — 시맨틱 variant × size × shape, outline 플래그는 색을 유지한 외곽선 스타일. `<Button>` 이 소비하며, `_overrides.tsx` 의 recipes.button 슬롯으로 교체 가능. */
export const buttonRecipe = recipe(
  tv({
    // `transition` (not transition-colors) so the active-press scale animates too — without press feedback a
    // synchronous button gives no sign at all that it was clicked. `disabled:pointer-events-none` already
    // suppresses :active, so the press state needs no disabled counterpart.
    base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-field font-medium transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    variants: {
      variant: {
        // Neutral filled button, paired with badgeRecipe's `default`. Distinct from `neutral`: this is
        // the muted surface, `neutral` is the neutral color token — two different fills that coexist.
        default: "bg-muted text-foreground hover:bg-muted/80",
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        accent: "bg-accent text-accent-foreground hover:bg-accent/90",
        neutral: "bg-neutral text-neutral-foreground hover:bg-neutral/90",
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
      // `size` already sets h-*, so squaring the aspect is enough and keeps xs/sm/lg square buttons
      // correct without a shape×size matrix.
      shape: {
        default: "",
        square: "aspect-square px-0",
        circle: "aspect-square rounded-full px-0",
      },
      // An outlined *colored* button (e.g. warning + outline) cannot be a `variant` value: only one value
      // can be chosen, so it would silently drop the color. The style modifier gets its own axis and the
      // color pairing lives in compoundVariants below. `variant: "outline"` stays as the neutral outline.
      outline: { true: "border bg-transparent" },
    },
    compoundVariants: [
      {
        variant: "primary",
        outline: true,
        class: "border-primary text-primary hover:bg-primary hover:text-primary-foreground",
      },
      {
        variant: "secondary",
        outline: true,
        class: "border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground",
      },
      {
        variant: "accent",
        outline: true,
        class: "border-accent text-accent hover:bg-accent hover:text-accent-foreground",
      },
      {
        variant: "neutral",
        outline: true,
        class: "border-neutral text-neutral hover:bg-neutral hover:text-neutral-foreground",
      },
      {
        variant: "destructive",
        outline: true,
        class: "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground",
      },
      {
        variant: "success",
        outline: true,
        class: "border-success text-success hover:bg-success hover:text-success-foreground",
      },
      {
        variant: "warning",
        outline: true,
        class: "border-warning text-warning hover:bg-warning hover:text-warning-foreground",
      },
      { variant: "info", outline: true, class: "border-info text-info hover:bg-info hover:text-info-foreground" },
    ],
    defaultVariants: { variant: "primary", size: "md", shape: "default" },
  }),
);
export type ButtonVariants = NonNullable<Parameters<typeof buttonRecipe>[0]>;

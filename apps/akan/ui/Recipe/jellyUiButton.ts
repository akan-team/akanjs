import { recipe, tv } from "akanjs/ui";

/** `akanjs/ui` 버튼의 젤리 look — `_overrides.tsx` 의 recipes.button 슬롯용. 색 variant 는 설탕 젤리, ghost/outline/link 는 표면 없이. */
export const jellyUiButtonRecipe = recipe(
  tv({
    base: "squish inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    variants: {
      variant: {
        default: "text-foreground",
        primary: "tint-primary text-primary-foreground",
        secondary: "tint-secondary text-secondary-foreground",
        accent: "tint-accent text-accent-foreground",
        neutral: "tint-neutral text-neutral-foreground",
        outline: "border border-foreground/12 bg-background/70 text-foreground hover:bg-foreground/5",
        ghost: "text-foreground/75 hover:bg-foreground/6 hover:text-foreground",
        destructive: "tint-destructive text-destructive-foreground",
        success: "tint-success text-success-foreground",
        warning: "tint-warning text-warning-foreground",
        info: "tint-info text-info-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-6 px-2.5 text-xs",
        sm: "h-8 px-3.5 text-sm",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10 px-0",
      },
      shape: {
        default: "",
        square: "aspect-square px-0",
        circle: "aspect-square px-0",
      },
      outline: { true: "border bg-transparent", false: "" },
    },
    compoundVariants: [
      { variant: "default", outline: false, class: "jelly-glass" },
      {
        variant: ["primary", "secondary", "accent", "neutral", "destructive", "success", "warning", "info"],
        outline: false,
        class: "jelly",
      },
      { variant: "primary", outline: true, class: "border-primary text-primary hover:bg-primary/8" },
      { variant: "secondary", outline: true, class: "border-secondary text-secondary hover:bg-secondary/8" },
      { variant: "accent", outline: true, class: "border-accent text-accent hover:bg-accent/8" },
      { variant: "neutral", outline: true, class: "border-neutral text-neutral hover:bg-neutral/8" },
      { variant: "destructive", outline: true, class: "border-destructive text-destructive hover:bg-destructive/8" },
      { variant: "success", outline: true, class: "border-success text-success hover:bg-success/8" },
      { variant: "warning", outline: true, class: "border-warning text-warning hover:bg-warning/8" },
      { variant: "info", outline: true, class: "border-info text-info hover:bg-info/8" },
    ],
    defaultVariants: { variant: "primary", size: "md", shape: "default" },
  }),
);
export type JellyUiButtonVariants = NonNullable<Parameters<typeof jellyUiButtonRecipe>[0]>;

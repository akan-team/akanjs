import { recipe, tv } from "akanjs/ui";

/** 브랜드 그라디언트 표면. radius/padding/shadow 는 호출부에서 조합한다. */
export const gradientSurfaceRecipe = recipe(
  tv({
    base: "bg-gradient-to-br",
    variants: {
      tone: {
        brand: "from-primary via-secondary to-accent",
        duo: "from-primary to-secondary",
        warm: "from-accent to-primary",
      },
    },
    defaultVariants: { tone: "brand" },
  }),
);
export type GradientSurfaceVariants = NonNullable<Parameters<typeof gradientSurfaceRecipe>[0]>;

import { recipe, tv } from "akanjs/ui";

/**
 * 카드 표면 — 은은한 경계선 위 표면. `tone` 으로 채움을 고른다(muted 기본/card/glass).
 * radius/padding 은 기존 규약대로 호출부에서 조합한다: `appCard({ tone: "card" }, "rounded-3xl p-4")`.
 */
export const appCard = recipe(
  tv({
    base: "border",
    variants: {
      tone: {
        muted: "border-foreground/10 bg-muted/70",
        card: "border-border bg-card text-card-foreground",
        glass: "border-foreground/10 bg-background/60 backdrop-blur",
      },
    },
    defaultVariants: { tone: "muted" },
  }),
);
export type AppCardVariants = NonNullable<Parameters<typeof appCard>[0]>;

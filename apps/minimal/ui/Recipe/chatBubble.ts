import { recipe, tv } from "akanjs/ui";

/** 챗 버블 — 수신(incoming)/발신(outgoing) 방향에 따라 정렬·모서리·색을 바꾼다. */
export const chatBubbleRecipe = recipe(
  tv({
    base: "max-w-[78%] rounded-3xl p-4 text-sm",
    variants: {
      side: {
        incoming: "rounded-tl-md bg-muted text-foreground/75",
        outgoing: "ml-auto rounded-tr-md bg-primary text-primary-foreground",
      },
    },
    defaultVariants: { side: "incoming" },
  }),
);
export type ChatBubbleVariants = NonNullable<Parameters<typeof chatBubbleRecipe>[0]>;

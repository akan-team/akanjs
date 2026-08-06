import { recipe, tv } from "akanjs/ui";

/** 유틸리티 패널/콜아웃 표면 — rounded-box + border 위 시맨틱 tone(default/muted/primary/success/warning/info/outline) × padding(none/sm/md/lg). 카드가 콘텐츠 표면이면 박스는 톤으로 강조하는 그룹/콜아웃 컨테이너. */
export const appBox = recipe(
  tv({
    base: "rounded-box border",
    variants: {
      tone: {
        default: "border-border bg-background",
        muted: "border-border bg-muted",
        primary: "border-primary/30 bg-primary/10",
        success: "border-success/30 bg-success/10",
        warning: "border-warning/30 bg-warning/10",
        info: "border-info/30 bg-info/10",
        outline: "border-border border-dashed",
      },
      padding: { none: "", sm: "p-3", md: "p-4", lg: "p-5" },
    },
    defaultVariants: { tone: "muted", padding: "md" },
  }),
);
export type AppBoxVariants = NonNullable<Parameters<typeof appBox>[0]>;

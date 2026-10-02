import { cn } from "akanjs/client";

/** 수평 구분선 — `my-4 h-px w-full bg-border` 반복 제거용 프리미티브. */
export const Divider = ({ className }: { className?: string }) => (
  <div className={cn("my-6 h-px w-full bg-linear-to-r from-transparent via-foreground/12 to-transparent", className)} />
);

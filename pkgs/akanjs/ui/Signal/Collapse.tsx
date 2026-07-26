"use client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";

/**
 * Signal 도큐먼트/테스트 카드의 접이식 컨테이너.
 * daisyui `collapse`(checkbox+CSS) → 네이티브 `<details>/<summary>`. 플러그인 의존 없음.
 */
export const SignalCollapse = ({
  summary,
  children,
  open,
  className,
  contentClassName,
}: {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
  className?: string;
  contentClassName?: string;
}) => (
  <details className={cn("group my-2 rounded-box bg-muted", className)} open={open}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0 flex-1">{summary}</div>
      <span className="shrink-0 text-foreground/50 transition-transform group-open:rotate-180">▾</span>
    </summary>
    <div className={cn("flex w-full flex-col gap-4 p-4 pt-0", contentClassName)}>{children}</div>
  </details>
);

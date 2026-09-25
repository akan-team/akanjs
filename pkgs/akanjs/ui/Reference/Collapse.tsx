import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { BiChevronDown } from "react-icons/bi";
import { docUi } from "./style";

interface CollapseProps {
  className?: string;
  contentClassName?: string;
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
}

/** 레퍼런스 카드의 접이식 컨테이너. daisyui `collapse` 대신 네이티브 `<details>/<summary>` — 열고 닫는 데 JS 가 없다. */
export const Collapse = ({ summary, children, open, className, contentClassName }: CollapseProps) => (
  <details
    className={cn(docUi.card, "group overflow-hidden transition-colors hover:border-foreground/20", className)}
    open={open}
  >
    <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0 flex-1">{summary}</div>
      <BiChevronDown className="mt-1 shrink-0 text-foreground/30 transition-transform group-open:rotate-180" />
    </summary>
    <div className={cn("flex w-full flex-col gap-4 border-border/70 border-t p-4", contentClassName)}>{children}</div>
  </details>
);

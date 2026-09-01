"use client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface SectionProps {
  className?: string;
  title: string;
  count: number;
  children: ReactNode;
  open?: boolean;
}

export default function Section({ className, title, count, children, open }: SectionProps) {
  return (
    <details className={cn("group rounded-box bg-muted", className)} open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-foreground/50 text-xs">{count}</span>
        <span className="ml-auto text-foreground/40 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="flex flex-col gap-1 px-3 pb-3">{children}</div>
    </details>
  );
}

import { cn } from "akanjs/client";
import { Clipboard } from "akanjs/ui";
import type { ReactNode } from "react";

interface CodeViewProps {
  className?: string;
  title?: string;
  children: ReactNode;
  copyText?: string;
  wrapperClassName?: string;
}

export const CodeView = ({ className, title, children, wrapperClassName, copyText }: CodeViewProps) => (
  <div className={cn("flex justify-center", wrapperClassName)}>
    <div
      className={cn(
        "studio-lift relative overflow-x-auto rounded-2xl border border-foreground/8 bg-card text-sm leading-6",
        className,
      )}
    >
      {title ? (
        <div className="sticky inset-x-0 top-0 flex h-10 w-full items-center justify-between gap-2 border-foreground/6 border-b bg-foreground/3 pr-2 pl-4 font-bold text-foreground/80 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="jelly tint-primary size-2.5 shrink-0 rounded-full" />
            <span className="min-w-0 truncate">{title}</span>
          </span>
          {copyText ? <Clipboard text={copyText} /> : null}
        </div>
      ) : null}
      {children}
    </div>
  </div>
);

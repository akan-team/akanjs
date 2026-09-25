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
    <div className={cn("relative overflow-x-scroll rounded-md border border-border bg-muted", className)}>
      {title ? (
        <div className="sticky inset-x-0 top-0 flex h-10 w-full items-center justify-between border-border border-b bg-background pr-2 pl-4 font-bold text-foreground text-sm">
          {title}
          {copyText ? <Clipboard text={copyText} /> : null}
        </div>
      ) : null}
      {children}
    </div>
  </div>
);

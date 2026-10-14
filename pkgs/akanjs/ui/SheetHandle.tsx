import { cn } from "akanjs/client";
import type { HTMLAttributes, ReactNode } from "react";

interface SheetHandleProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  /** Drawn in place of the default grab bar. */
  children?: ReactNode;
}
export const SheetHandle = ({ className, children, ...props }: SheetHandleProps) => (
  <div {...props} className={cn("flex shrink-0 justify-center", className)}>
    {children ?? <div className="h-1 w-10 rounded-full bg-foreground/15" />}
  </div>
);

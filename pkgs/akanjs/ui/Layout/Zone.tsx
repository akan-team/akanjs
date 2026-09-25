import { cn } from "akanjs/client";
import type { ReactNode } from "react";

export interface ZoneProps {
  className?: string;
  children: ReactNode;
}
export const Zone = ({ className, children }: ZoneProps) => {
  return <div className={cn("flex size-full max-w-5xl flex-col gap-6 px-2", className)}>{children}</div>;
};

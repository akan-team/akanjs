"use client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";

export interface ContentProps {
  className?: string;
  children?: ReactNode;
}
export const Content = ({ className, children }: ContentProps) => {
  return <div className={cn("block w-full", className)}>{children}</div>;
};

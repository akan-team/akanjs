"use client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";

export interface MenusProps {
  className?: string;
  children: ReactNode;
}
export const Menus = ({ className, children }: MenusProps) => (
  <div className={cn("inline-flex items-center gap-1", className)} role="tablist">
    {children}
  </div>
);

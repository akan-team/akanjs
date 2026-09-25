"use client";
import type { ReactNode } from "react";

export interface MenusProps {
  className?: string;
  children: ReactNode;
}
export const Menus = ({ className, children }: MenusProps) => {
  return <div className={className}>{children}</div>;
};

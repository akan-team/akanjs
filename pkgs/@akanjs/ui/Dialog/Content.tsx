"use client";
import { clsx } from "@akanjs/client";
import { ReactNode } from "react";

export interface ContentProps {
  className?: string;
  children?: ReactNode;
}
export const Content = ({ className, children }: ContentProps) => {
  return <div className={clsx("block w-full", className)}>{children}</div>;
};

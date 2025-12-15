import { clsx } from "@akanjs/client";
import type { CSSProperties } from "react";

export interface LoadingProps {
  className?: string;
  active?: boolean;
  style?: CSSProperties;
}
export const Input = ({ className = "", active, style }: LoadingProps) => {
  const activeClassName = active ? "animate-pulse" : "";
  return (
    <div
      className={clsx("inline-block h-8 w-44 rounded-md bg-gray-200 align-bottom", activeClassName, className)}
      style={style}
    />
  );
};

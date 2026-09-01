import { cn } from "akanjs/client";
import type { CSSProperties } from "react";

export interface LoadingProps {
  className?: string;
  active?: boolean;
  style?: CSSProperties;
}

export const Input = ({ className = "", active = true, style }: LoadingProps) => (
  <div
    className={cn("inline-block h-9 w-44 rounded-field bg-muted align-bottom", active && "animate-pulse", className)}
    style={style}
  />
);

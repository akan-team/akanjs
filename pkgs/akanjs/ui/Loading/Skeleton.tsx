import { cn } from "akanjs/client";
import type { CSSProperties } from "react";

export interface SkeletonProps {
  className?: string;
  active?: boolean;
  style?: CSSProperties;
}

export const Skeleton = ({ className = "", active = true, style }: SkeletonProps) => (
  <div className={cn("flex w-full flex-col gap-3", active && "animate-pulse", className)} style={style}>
    <div className="h-4 w-2/5 rounded-field bg-muted" />
    <div className="h-4 w-full rounded-field bg-muted" />
    <div className="h-4 w-full rounded-field bg-muted" />
    <div className="h-4 w-3/5 rounded-field bg-muted" />
  </div>
);

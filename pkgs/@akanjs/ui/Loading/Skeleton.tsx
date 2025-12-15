import { clsx } from "@akanjs/client";
import type { CSSProperties } from "react";

export interface SkeletonProps {
  className?: string;
  active?: boolean;
  style?: CSSProperties;
}

export const Skeleton = ({ className = "", active, style }: SkeletonProps) => {
  const activeClassName = active ? "animate-pulse" : "";
  return (
    <div className={clsx("w-full", activeClassName, className)} style={style}>
      <div className="flex flex-col justify-start space-y-3">
        <div className="h-4 w-2/5 rounded-md bg-gray-200"></div>
        <div className="h-4 w-full rounded-md bg-gray-200"></div>
        <div className="h-4 w-full rounded-md bg-gray-200"></div>
        <div className="h-4 w-3/5 rounded-md bg-gray-200"></div>
      </div>
    </div>
  );
};

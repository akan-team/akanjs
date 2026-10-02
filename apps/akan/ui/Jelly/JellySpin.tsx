import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { JellyStar } from "./JellyStar";

const sizeClass = { sm: "text-sm", md: "text-xl", lg: "text-3xl" } as const;

interface JellySpinProps {
  className?: string;
  indicator?: ReactNode;
  isCenter?: boolean;
  size?: "sm" | "md" | "lg" | number;
  tone?: "primary" | "current" | "muted";
}
export const JellySpin = ({ className, indicator, isCenter, size = "md" }: JellySpinProps) => {
  return (
    <div
      className={cn(
        "inline-flex py-1",
        typeof size === "string" && sizeClass[size],
        isCenter && "absolute inset-0 size-full items-center justify-center py-0",
        className,
      )}
      style={typeof size === "number" ? { fontSize: size } : undefined}
    >
      {indicator ? (
        <span className="[&>svg]:animate-spin">{indicator}</span>
      ) : (
        <JellyStar className="size-[1.6em]" motion="hop" shadow={false} />
      )}
    </div>
  );
};

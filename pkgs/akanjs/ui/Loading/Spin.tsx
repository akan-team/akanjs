import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

export interface SpinProps {
  indicator?: ReactNode;
  isCenter?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClass = { sm: "text-sm", md: "text-xl", lg: "text-3xl" } as const;

export const Spin = ({ indicator, isCenter, className, size = "md" }: SpinProps) => (
  <div
    className={cn(
      "inline-block py-1",
      isCenter && "absolute inset-0 flex size-full items-center justify-center py-0",
      className,
    )}
  >
    {indicator ? (
      <span className="[&>svg]:animate-spin">{indicator}</span>
    ) : (
      <AiOutlineLoading3Quarters className={cn("animate-spin text-primary/70", sizeClass[size])} />
    )}
  </div>
);

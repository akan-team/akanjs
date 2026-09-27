import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface AbstractProps {
  className?: string;
  children: ReactNode;
}
export const Abstract = ({ className, children }: AbstractProps) => {
  return (
    <div
      className={cn(
        "hover:z-20 hover:scale-105",
        className,
        // "group-data-[open=true]/gridunit:hidden"
      )}
    >
      {children}
    </div>
  );
};

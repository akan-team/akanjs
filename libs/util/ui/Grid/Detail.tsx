import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface DetailProps {
  className?: string;
  children: ReactNode;
}
export const Detail = ({ className, children }: DetailProps) => {
  return (
    <div className={cn(className, "absolute inset-0 m-auto bg-background group-data-[open=false]/gridunit:hidden")}>
      {children}
    </div>
  );
};

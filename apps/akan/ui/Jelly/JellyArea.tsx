import { usePage } from "@apps/akan/client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { JellyStar } from "./JellyStar";

interface JellyAreaProps {
  className?: string;
  indicator?: ReactNode;
  children?: ReactNode;
}
export const JellyArea = ({ className, indicator, children }: JellyAreaProps) => {
  const { l } = usePage();
  return (
    <div
      className={cn(
        "absolute inset-0 flex size-full flex-col items-center justify-center gap-2 rounded-[inherit] bg-background/60 backdrop-blur-sm",
        className,
      )}
    >
      {indicator ?? <JellyStar className="size-12" motion="hop" />}
      <div className="font-semibold text-foreground/55 text-sm">{children ?? l("base.processing")}</div>
    </div>
  );
};

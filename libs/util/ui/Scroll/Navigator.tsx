"use client";
import { cn } from "akanjs/client";
import { Link } from "akanjs/ui";
import { useContext } from "react";

import { ScrollContext } from "./context";

export interface NavigatorProps {
  className?: string;
}
export const Navigator = ({ className }: NavigatorProps) => {
  const { slide, slideIds } = useContext(ScrollContext);
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-3 z-20 m-auto flex size-fit flex-row gap-2 md:inset-y-0 md:right-auto md:left-4 md:flex-col",
        className,
      )}
    >
      {slideIds.map((slideId) => (
        <Link
          key={slideId}
          href={`#${slideId}`}
          className={cn(
            "mb-2 size-3 cursor-pointer rounded-full hover:text-primary",
            slide === slideId && "bg-primary",
            slide !== slideId && "bg-muted-foreground",
          )}
        />
      ))}
    </div>
  );
};

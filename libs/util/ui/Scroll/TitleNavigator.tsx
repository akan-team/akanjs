"use client";
import { cn } from "akanjs/client";
import { Link } from "akanjs/ui";
import { useContext } from "react";

import { ScrollContext } from "./context";

export interface TitleNavigatorProps {
  className?: string;
}
export const TitleNavigator = ({ className }: TitleNavigatorProps) => {
  const { slide, slides } = useContext(ScrollContext);

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {slides.map(({ id, title }) => (
        <Link key={id} href={`#${id}`} className="flex min-w-0 items-center gap-2 transition-colors hover:text-primary">
          <div
            className={cn("size-1 rounded-full", slide === id && "bg-primary", slide !== id && "bg-foreground/50")}
          />
          <span className={cn("break-words text-sm", slide === id && "font-bold text-primary")}>{title}</span>
        </Link>
      ))}
    </div>
  );
};

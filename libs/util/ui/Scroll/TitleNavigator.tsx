"use client";
import { clsx } from "akanjs/client";
import { Link } from "akanjs/ui";
import { useContext } from "react";

import { ScrollContext } from "./context";

export interface TitleNavigatorProps {
  className?: string;
}
export const TitleNavigator = ({ className }: TitleNavigatorProps) => {
  const { slide, slides } = useContext(ScrollContext);

  return (
    <div className={clsx("flex min-w-0 flex-col gap-2", className)}>
      {slides.map(({ id, title }) => (
        <Link key={id} href={`#${id}`} className="flex min-w-0 items-center gap-2 transition-colors hover:text-primary">
          <div
            className={clsx("size-1 rounded-full", {
              "bg-primary": slide === id,
              "bg-base-content/50": slide !== id,
            })}
          />
          <span className={clsx("break-words text-sm", { "font-bold text-primary": slide === id })}>{title}</span>
        </Link>
      ))}
    </div>
  );
};

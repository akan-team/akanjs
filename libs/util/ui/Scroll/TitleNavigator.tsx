"use client";
import { clsx } from "@akanjs/client";
import { Link } from "@akanjs/ui";
import { useContext } from "react";

import { ScrollContext } from "./context";

export interface TitleNavigatorProps {
  className?: string;
}
export const TitleNavigator = ({ className }: TitleNavigatorProps) => {
  const { slide, slides } = useContext(ScrollContext);
  return (
    <div className={clsx("flex flex-col", className)}>
      {slides.map(({ id, title }) => (
        <Link
          key={id}
          href={`#${id}`}
          className="flex items-center gap-2 transition-opacity duration-300 hover:opacity-50"
        >
          <div
            className={clsx("size-1 rounded-full", {
              "bg-primary": slide === id,
              "bg-base-content/50": slide !== id,
            })}
          />
          <span className={clsx("text-sm", { "text-primary font-bold": slide === id })}>{title}</span>
        </Link>
      ))}
    </div>
  );
};

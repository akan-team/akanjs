"use client";
import { clsx } from "@akanjs/client";
import { Link } from "@akanjs/ui";
import { useContext } from "react";

import { ScrollContext } from "./context";

export interface NavigatorProps {
  className?: string;
}
export const Navigator = ({ className }: NavigatorProps) => {
  const { slide, slideIds } = useContext(ScrollContext);
  return (
    <div
      className={clsx(
        "fixed inset-x-0 bottom-3 z-20 m-auto flex size-fit flex-row gap-2 md:inset-y-0 md:right-auto md:left-4 md:flex-col",
        className
      )}
    >
      {slideIds.map((slideId) => (
        <Link
          key={slideId}
          href={`#${slideId}`}
          className={clsx("hover:text-primary mb-2 size-3 cursor-pointer rounded-full", {
            "bg-primary": slide === slideId,
            "bg-slate-400": slide !== slideId,
          })}
        />
      ))}
    </div>
  );
};

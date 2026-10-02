import { cn } from "akanjs/client";
import { Link } from "akanjs/ui";
import type { ReactNode } from "react";

import { panelRecipe } from "../Recipe";
import { CodeText } from "./CodeText";

export interface LinkGridItem {
  href: string;
  title: ReactNode;
  desc: ReactNode;
}

interface LinkGridProps {
  className?: string;
  items: LinkGridItem[];
}

export const LinkGrid = ({ className, items }: LinkGridProps) => {
  return (
    <div className={cn("my-5 grid gap-3 md:grid-cols-2", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={panelRecipe(
            { tone: "jelly", radius: "2xl", padding: "none" },
            "group squish hover:tint-primary px-4 py-3.5 transition-shadow",
          )}
        >
          <div className="flex items-center justify-between gap-2 font-extrabold text-foreground text-sm tracking-tight group-hover:text-primary">
            {item.title}
            <span className="jelly tint-primary inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] text-primary-foreground transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </div>
          <div className="mt-1 text-foreground/65 text-sm leading-snug">
            <CodeText>{item.desc}</CodeText>
          </div>
        </Link>
      ))}
    </div>
  );
};

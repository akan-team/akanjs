"use client";
import { cn, usePage } from "akanjs/client";
import type { ReactNode } from "react";
import { AiOutlineInbox } from "react-icons/ai";

import { createOverridable } from "./UiOverride";

export interface EmptyProps {
  /** Additional classes for the empty-state body. */
  className?: string;
  /** Custom description. Defaults to the localized base.noData label. */
  description?: ReactNode;
  /** Optional content rendered below the empty-state body. */
  children?: ReactNode;
  /** Minimum empty-state height in pixels. */
  minHeight?: number;
}

export const DefaultEmpty = ({ className = "", description, children, minHeight = 300 }: EmptyProps) => {
  const { l } = usePage();
  return (
    <div>
      {/* minHeight is a runtime number, so it has to be a style prop: Tailwind extracts arbitrary values
          from source text, so `min-h-[${minHeight}px]` compiles to no CSS and the prop is silently ignored. */}
      <div
        style={{ minHeight }}
        className={cn("flex w-full flex-col items-center justify-center gap-3 px-6 py-8 text-center", className)}
      >
        <div className="flex size-14 items-center justify-center rounded-full bg-muted text-3xl text-foreground/35">
          <AiOutlineInbox />
        </div>
        <p className="text-foreground/55 text-sm">{description ?? l("base.noData")}</p>
      </div>
      {children}
    </div>
  );
};

/**
 * Empty-state placeholder. Resolves to a route-scoped override when a
 * `page/**\/_overrides.tsx` in the route's ancestry declares one, otherwise
 * renders {@link DefaultEmpty}.
 */
export const Empty = createOverridable("Empty", DefaultEmpty);

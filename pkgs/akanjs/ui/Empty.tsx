"use client";
import { clsx, usePage } from "akanjs/client";
import type { ReactNode } from "react";
import { AiOutlineMeh } from "react-icons/ai";

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
      <div
        className={clsx(
          `min-h-[${minHeight}px] flex flex-col items-center justify-center gap-3 pt-6 pb-3 text-base-content/30`,
          className,
        )}
      >
        <AiOutlineMeh className="scale-150 text-4xl" />
        <p>{description ?? l("base.noData")}</p>
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

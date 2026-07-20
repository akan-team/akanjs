"use client";
import { clsx, usePage } from "akanjs/client";
import type { ReactNode } from "react";
import { AiOutlineBlock } from "react-icons/ai";

import { createOverridable } from "./UiOverride";

export interface UnauthorizedProps {
  className?: string;
  description?: ReactNode;
  children?: ReactNode;
  minHeight?: number;
}

export const DefaultUnauthorized = ({ className = "", description, children, minHeight = 300 }: UnauthorizedProps) => {
  const { l } = usePage();
  return (
    <div>
      <div
        className={clsx(
          `min-h-[ w-full${minHeight}px] flex flex-col items-center justify-center gap-3 pt-6 pb-3 text-base-content/30`,
          className,
        )}
      >
        <AiOutlineBlock className="scale-150 text-4xl" />
        <p>{description ?? l("base.unauthorized")}</p>
      </div>
      {children}
    </div>
  );
};

/**
 * Unauthorized-state placeholder. Resolves to a route-scoped override when a
 * `page/**\/_overrides.tsx` in the route's ancestry declares one, otherwise
 * renders {@link DefaultUnauthorized}.
 */
export const Unauthorized = createOverridable("Unauthorized", DefaultUnauthorized);

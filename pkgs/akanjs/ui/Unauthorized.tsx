"use client";
import { cn, usePage } from "akanjs/client";
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
      {/* minHeight is a runtime number, so it has to be a style prop — see Empty.tsx. The interpolated form
          also had `w-full` typo'd inside the brackets, which broke that class too. */}
      <div
        style={{ minHeight }}
        className={cn("flex w-full flex-col items-center justify-center gap-3 pt-6 pb-3 text-foreground/30", className)}
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

"use client";
import { cn } from "akanjs/client";
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { createOverridable } from "./UiOverride";

/** Canonical cva for badges. Existing inline `<span className="badge badge-*">` sites
 *  migrate to `className={badgeVariants({ variant })}` (className-only change). */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium text-xs",
  {
    variants: {
      variant: {
        default: "border-transparent bg-muted text-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        accent: "border-transparent bg-accent text-accent-foreground",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        error: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;
export type BadgeProps = HTMLAttributes<HTMLSpanElement> & BadgeVariants;

const DefaultBadge = ({ className, variant, ...rest }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...rest} />
);

/** Status/label pill. Route-overridable via `page/**\/_overrides.tsx` (slot `Badge`). */
export const Badge = createOverridable("Badge", DefaultBadge);

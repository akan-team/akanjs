"use client";
import type { HTMLAttributes } from "react";
import { type BadgeVariants, badgeRecipe } from "./recipe";
import { createOverridable, useUiRecipe } from "./UiOverride";

// badgeRecipe/BadgeVariants live in the server-safe ./recipe layer (no "use client") so server
// components can compose classNames. Re-exported here so `from "./Badge"` relative importers keep resolving.
export { type BadgeVariants, badgeRecipe };

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & BadgeVariants;

const DefaultBadge = ({ className, variant, size, outline, ...rest }: BadgeProps) => {
  // Route-scoped look swap (recipe slot); structure stays.
  const recipe = useUiRecipe("badge") ?? badgeRecipe;
  return <span className={recipe({ variant, size, outline }, className)} {...rest} />;
};

/** Status/label pill. Route-overridable via `page/**\/_overrides.tsx` (slot `Badge`). */
export const Badge = createOverridable("Badge", DefaultBadge);

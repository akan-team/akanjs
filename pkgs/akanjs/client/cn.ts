import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Akan's semantic color tokens beyond tailwind-merge's built-in Tailwind palette.
 * Registering them under `theme.color` teaches tailwind-merge that `bg-*`/`text-*`/
 * `border-*`/… built from these names belong to the same conflict group, so
 * `cn("bg-primary", "bg-open")` correctly resolves to `"bg-open"` instead of keeping both.
 */
const colorTokens = [
  "background",
  "foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "accent",
  "accent-foreground",
  "muted",
  "muted-foreground",
  "destructive",
  "destructive-foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "info",
  "info-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "neutral",
  "neutral-foreground",
  "open",
  "open-foreground",
  "border",
  "input",
  "ring",
];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: colorTokens,
    },
  },
});

/** Composes class names with clsx, then resolves Tailwind conflicts with a
 *  shared tailwind-merge instance that knows Akan's semantic color tokens. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

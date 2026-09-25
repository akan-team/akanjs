import { type ClassNameValue, extendTailwindMerge } from "tailwind-merge";

/**
 * Akan's semantic color tokens beyond tailwind-merge's built-in Tailwind palette.
 * Registering them under `theme.color` teaches tailwind-merge that `bg-*`/`text-*`/
 * `border-*`/… built from these names belong to the same conflict group, so
 * `cn("bg-primary", "bg-open")` correctly resolves to `"bg-open"` instead of keeping both.
 */
export const colorTokens = [
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

/**
 * Akan's semantic radius tokens (`--radius-box` / `--radius-field` in ui/styles.css). Without them
 * `cn("rounded-field", "rounded-full")` keeps both classes and stylesheet order decides the winner.
 */
export const radiusTokens = ["box", "field"];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: colorTokens,
      radius: radiusTokens,
    },
  },
});

/** The one class-combining function: joins strings/arrays/conditional parts (`cond && "x"`) and
 *  resolves Tailwind conflicts with a shared tailwind-merge instance that knows Akan's semantic
 *  color tokens. clsx-style object syntax (`{ x: cond }`) is not supported — write `cond && "x"`. */
export const cn = (...inputs: ClassNameValue[]) => twMerge(...inputs);

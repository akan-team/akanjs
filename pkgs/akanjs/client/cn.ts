import { type ClassNameValue, extendTailwindMerge } from "tailwind-merge";

/** @internal Registered with tailwind-merge so `cn("bg-primary", "bg-open")` resolves to `"bg-open"` instead of keeping both. */
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

/** @internal `--radius-box` / `--radius-field`; unregistered, `cn("rounded-field", "rounded-full")` would keep both. */
export const radiusTokens = ["box", "field"];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: colorTokens,
      radius: radiusTokens,
    },
  },
});

/** Joins class parts and resolves Tailwind conflicts; object syntax (`{ x: cond }`) is unsupported — write `cond && "x"`. */
export const cn = (...inputs: ClassNameValue[]) => twMerge(...inputs);

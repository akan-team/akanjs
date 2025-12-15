import { withVariants } from "@udecode/cn";
import { cva } from "class-variance-authority";

export const inputVariants = cva(
  "file:bg-background placeholder:text-muted-foreground flex w-full rounded-md bg-transparent text-sm file:border-0 file:text-sm file:font-medium focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-input ring-offset-background focus-visible:ring-ring border focus-visible:ring-2 focus-visible:ring-offset-2",
        ghost: "border-none focus-visible:ring-transparent",
      },
      h: {
        sm: "h-9 px-3 py-2",
        md: "h-10 px-3 py-2",
      },
    },
    defaultVariants: {
      variant: "default",
      h: "md",
    },
  }
);

export const Input = withVariants("input", inputVariants, ["variant", "h"]);

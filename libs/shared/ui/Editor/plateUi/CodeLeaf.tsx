"use client";

import { cn, withRef } from "@udecode/cn";
import { PlateLeaf } from "@udecode/plate-common";
import React from "react";

export const CodeLeaf = withRef<typeof PlateLeaf>(({ className, children, ...props }, ref) => {
  return (
    <PlateLeaf
      ref={ref}
      asChild
      className={cn(
        "whitespace-pre-wrap rounded-md bg-muted px-[0.3em] py-[0.2em] font-mono text-sm bg-base-300/80",
        className
      )}
      {...props}
    >
      <code>{children}</code>
    </PlateLeaf>
  );
});

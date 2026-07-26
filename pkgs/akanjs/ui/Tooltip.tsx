"use client";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";

import { createOverridable } from "./UiOverride";

export interface TooltipProps {
  /** 툴팁에 표시할 내용. 비어 있으면 트리거만 그대로 렌더한다. */
  content?: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  /** 색상 변형. daisyui `tooltip-primary/info` 대체. */
  variant?: "default" | "primary" | "info";
}

const variantClass = {
  default: "bg-foreground text-background",
  primary: "bg-primary text-primary-foreground",
  info: "bg-info text-info-foreground",
};

/**
 * Radix 기반 툴팁. daisyui `tooltip`(CSS `data-tip`) 대체.
 * `page/**\/_overrides.tsx`로 라우트별 교체 가능(slot `Tooltip`).
 */
const DefaultTooltip = ({ content, children, side = "top", className, variant = "default" }: TooltipProps) => {
  if (content === undefined || content === null || content === "") return <>{children}</>;
  return (
    <RadixTooltip.Provider delayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className={cn(
              "z-50 max-w-xs animate-fadeIn rounded-field px-2 py-1 text-xs shadow-md",
              variantClass[variant],
              className,
            )}
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
};

export const Tooltip = createOverridable("Tooltip", DefaultTooltip);

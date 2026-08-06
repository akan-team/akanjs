"use client";
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

const sideClass = {
  top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
};

/**
 * 순수 CSS 툴팁 (hover/focus-within). daisyui `tooltip` 및 Radix Tooltip 대체.
 * 트리거를 감싸 hover 또는 키보드 포커스 시 표시한다. 뷰포트 엣지 flip은 없다(힌트 UI 한정).
 * `page/**\/_overrides.tsx`로 라우트별 교체 가능(slot `Tooltip`).
 */
const DefaultTooltip = ({ content, children, side = "top", className, variant = "default" }: TooltipProps) => {
  if (content === undefined || content === null || content === "") return <>{children}</>;
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-xs rounded-field px-2 py-1 text-xs opacity-0 shadow-md transition-opacity duration-150 group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100",
          sideClass[side],
          variantClass[variant],
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
};

export const Tooltip = createOverridable("Tooltip", DefaultTooltip);

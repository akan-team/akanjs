import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface MobileMockupProps {
  /** Screen content — typically a rendered preview surface. */
  children?: ReactNode;
  /** Wrapper class; controls the device width (defaults to `w-48`). */
  className?: string;
  /** Inner screen class; layered over the default `bg-background`. */
  screenClassName?: string;
}

/**
 * iPhone-style device wireframe for previewing a rendered surface.
 *
 * Presentational and server-safe (no hooks, no `"use client"`): pass the preview
 * into `children`. The bezel/rail/dynamic-island are drawn from the `black`
 * token so the frame stays theme-aware (dark bezel in light theme, light in dark).
 */
export const MobileMockup = ({ children, className, screenClassName }: MobileMockupProps) => {
  return (
    <div className={cn("relative w-48 shrink-0", className)}>
      {/* Side buttons — left: mute switch + volume up/down, right: power */}
      <div className="absolute top-[16%] -left-[2px] h-5 w-[3px] rounded-l-sm bg-black/40" />
      <div className="absolute top-[26%] -left-[2px] h-9 w-[3px] rounded-l-sm bg-black/40" />
      <div className="absolute top-[39%] -left-[2px] h-9 w-[3px] rounded-l-sm bg-black/40" />
      <div className="absolute top-[30%] -right-[2px] h-14 w-[3px] rounded-r-sm bg-black/40" />

      {/* Titanium rail wrapping the bezel for a two-tone edge */}
      <div className="rounded-[2.5rem] bg-black/60 p-[3px] shadow-2xl">
        <div className="relative overflow-hidden rounded-[2.2rem] border-[6px] border-black bg-background">
          {/* Dynamic Island */}
          <div className="absolute top-2.5 left-1/2 z-10 h-5 w-16 -translate-x-1/2 rounded-full bg-black/80" />
          {/* Screen */}
          <div
            className={cn("flex aspect-[9/19] w-full items-center justify-center px-4 text-center", screenClassName)}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

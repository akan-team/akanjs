import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface BrowserMockupProps {
  /** Preview content shown in the browser viewport. */
  children?: ReactNode;
  /** Address-bar text (defaults to the local gateway URL). */
  url?: string;
  /** Wrapper class. */
  className?: string;
  /** Viewport (content region) class; layered over the default centered `h-80`. */
  screenClassName?: string;
}

/**
 * Browser-window wireframe for previewing a rendered page. Presentational and
 * server-safe (no hooks, no `"use client"`): pass the preview into `children`,
 * set the address bar via `url`. The window controls are the classic red/amber/green dots.
 */
export const BrowserMockup = ({
  children,
  url = "http://localhost:8282",
  className,
  screenClassName,
}: BrowserMockupProps) => (
  <div className={cn("w-full overflow-hidden rounded-box border-2 border-foreground/30 bg-background", className)}>
    <div className="flex items-center border-0 border-foreground/10 border-b-2 border-b-foreground/30 px-2">
      <div className="flex items-center gap-2">
        {/* biome-ignore lint/plugin: macOS traffic-light dots are fixed OS-chrome colors, not theme tokens */}
        <div className="size-3 rounded-full bg-[#f02020]" />
        {/* biome-ignore lint/plugin: macOS traffic-light dots are fixed OS-chrome colors, not theme tokens */}
        <div className="size-3 rounded-full bg-[#ffcc00]" />
        {/* biome-ignore lint/plugin: macOS traffic-light dots are fixed OS-chrome colors, not theme tokens */}
        <div className="size-3 rounded-full bg-[#3ed13b]" />
      </div>
      <div className="flex w-full items-center gap-2 border-foreground/10 p-3">
        <div className="w-full rounded-field border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none">
          {url}
        </div>
      </div>
    </div>
    <div className={cn("flex h-80 place-content-center items-center justify-center text-2xl", screenClassName)}>
      {children}
    </div>
  </div>
);

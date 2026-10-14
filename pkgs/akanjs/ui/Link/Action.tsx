"use client";
import { cn, router } from "akanjs/client";
import type { ReactNode } from "react";

export interface ActionProps {
  className?: string;
  children?: ReactNode;
}

export interface BackProps extends ActionProps {
  /** Where to go when there is no history to go back to, as on a deep link or a freshly opened app. */
  fallback?: string;
}

export const Back = ({ className, children, fallback }: BackProps) => (
  <button
    type="button"
    className={cn("cursor-pointer", className)}
    onClick={() => (fallback === undefined ? router.back() : router.backOrFallback(fallback))}
  >
    {children}
  </button>
);

export const Close = ({ className, children }: ActionProps) => (
  <div className={cn("cursor-pointer", className)} onClick={() => window.close()}>
    {children}
  </div>
);

export interface LangProps extends ActionProps {
  lang: "ko" | "en" | (string & {});
}
export const Lang = ({ className, lang, children }: LangProps) => (
  <div className={cn("cursor-pointer", className)} onClick={() => router.setLang(lang)}>
    {children}
  </div>
);

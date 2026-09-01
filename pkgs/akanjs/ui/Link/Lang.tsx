"use client";
import { cn, router } from "akanjs/client";
import type { ReactNode } from "react";

interface LangProps {
  className?: string;
  lang: "ko" | "en" | (string & {});
  children?: ReactNode;
}
export default function Lang({ className, lang, children }: LangProps) {
  return (
    <div className={cn("cursor-pointer", className)} onClick={() => router.setLang(lang)}>
      {children}
    </div>
  );
}

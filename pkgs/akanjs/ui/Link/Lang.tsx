"use client";
import { clsx, router } from "akanjs/client";
import type { ReactNode } from "react";

interface LangProps {
  className?: string;
  lang: "ko" | "en" | (string & {});
  children?: ReactNode;
}
export default function Lang({ className, lang, children }: LangProps) {
  return (
    <div className={clsx("cursor-pointer", className)} onClick={() => router.setLang(lang)}>
      {children}
    </div>
  );
}

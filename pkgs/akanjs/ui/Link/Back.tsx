"use client";
import { clsx, router } from "akanjs/client";
import type { ReactNode } from "react";

interface BackProps {
  className?: string;
  children?: ReactNode;
}
export default function Back({ className, children }: BackProps) {
  return (
    <div className={clsx("cursor-pointer", className)} onClick={() => router.back()}>
      {children}
    </div>
  );
}

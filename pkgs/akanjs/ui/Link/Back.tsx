"use client";
import { cn, router } from "akanjs/client";
import type { ReactNode } from "react";

interface BackProps {
  className?: string;
  children?: ReactNode;
}
export default function Back({ className, children }: BackProps) {
  return (
    <div className={cn("cursor-pointer", className)} onClick={() => router.back()}>
      {children}
    </div>
  );
}

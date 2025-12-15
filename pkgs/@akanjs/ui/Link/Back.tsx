"use client";
import { clsx, router } from "@akanjs/client";

interface BackProps {
  className?: string;
  children?: any;
}
export default function Back({ className, children }: BackProps) {
  return (
    <div className={clsx("cursor-pointer", className)} onClick={() => router.back()}>
      {children}
    </div>
  );
}

"use client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface CloseProps {
  className?: string;
  children?: ReactNode;
}
export default function Close({ className, children }: CloseProps) {
  return (
    <div
      className={cn("cursor-pointer", className)}
      onClick={() => {
        window.close();
      }}
    >
      {children}
    </div>
  );
}

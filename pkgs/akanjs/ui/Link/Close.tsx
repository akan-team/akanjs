"use client";
import { clsx } from "akanjs/client";
import type { ReactNode } from "react";

interface CloseProps {
  className?: string;
  children?: ReactNode;
}
export default function Close({ className, children }: CloseProps) {
  return (
    <div
      className={clsx("cursor-pointer", className)}
      onClick={() => {
        window.close();
      }}
    >
      {children}
    </div>
  );
}

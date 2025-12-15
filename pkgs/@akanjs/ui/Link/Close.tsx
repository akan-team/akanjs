"use client";
import { clsx } from "@akanjs/client";

interface CloseProps {
  className?: string;
  children?: any;
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

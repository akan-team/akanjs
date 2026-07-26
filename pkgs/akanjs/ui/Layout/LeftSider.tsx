"use client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { BiX } from "react-icons/bi";
import { buttonVariants } from "../Button";

export interface LeftSiderProps {
  className?: string;
  children: ReactNode;
  open: boolean;
  width?: number | string;
  onCancel: () => void;
}
export const LeftSider = ({ className, children, open, width, onCancel }: LeftSiderProps) => {
  return (
    <div
      className={cn(
        "absolute top-0 border-muted border-r bg-background transition-all duration-150",
        { "translate-x-0": open, "translate-x-[-100%]": !open },
        className,
      )}
      style={{ width }}
    >
      {children}
      <button
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "absolute top-0 right-0")}
        onClick={() => {
          onCancel();
        }}
      >
        <BiX />
      </button>
    </div>
  );
};

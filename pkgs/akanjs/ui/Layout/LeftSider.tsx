"use client";
import { clsx } from "akanjs/client";
import type { ReactNode } from "react";
import { BiX } from "react-icons/bi";

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
      className={clsx(
        "absolute top-0 border-base-200 border-r bg-base-100 transition-all duration-150",
        { "translate-x-0": open, "translate-x-[-100%]": !open },
        className,
      )}
      style={{ width }}
    >
      {children}
      <button
        className="btn btn-ghost btn-square absolute top-0 right-0"
        onClick={() => {
          onCancel();
        }}
      >
        <BiX />
      </button>
    </div>
  );
};

"use client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { AiOutlineClose } from "react-icons/ai";

export interface RightSiderProps {
  className?: string;
  children: ReactNode;
  open: boolean;
  title?: string;
  width?: number | string;
  onCancel: () => void;
}
export const RightSider = ({ className, children, open, title, width, onCancel }: RightSiderProps) => {
  return (
    <div
      className={cn(
        "group absolute top-0 right-0 overflow-y-auto border-muted border-l bg-background pt-14 transition-all duration-150",
        open && "translate-x-0",
        !open && "translate-x-[100%]",
        className,
      )}
      style={{ width }}
    >
      {children}
      <div className="absolute top-2 left-4 flex items-center gap-4 pt-2 text-xl">
        <div
          className={cn(
            "cursor-pointer border-muted bg-background transition-all duration-150",
            open && "opacity-100",
            !open && "opacity-0",
          )}
          onClick={() => {
            onCancel();
          }}
        >
          <AiOutlineClose />
        </div>
        {title ? <div className="whitespace-nowrap">{title}</div> : null}
      </div>
    </div>
  );
};

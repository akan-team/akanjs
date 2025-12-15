// "use client";
import { clsx, usePage } from "@akanjs/client";
import React, { ReactNode } from "react";
import { AiOutlineMeh } from "react-icons/ai";

interface EmptyProps {
  className?: string;
  description?: ReactNode;
  children?: ReactNode;
  minHeight?: number;
}

export const Empty = ({ className = "", description, children, minHeight = 300 }: EmptyProps) => {
  const { l } = usePage();
  return (
    <div>
      <div
        className={clsx(
          `min-h-[${minHeight}px] text-base-content/30 flex flex-col items-center justify-center gap-3 pt-6 pb-3`,
          className
        )}
      >
        <AiOutlineMeh className="scale-150 text-4xl" />
        <p>{description ?? l("base.noData")}</p>
      </div>
      {children}
    </div>
  );
};

import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface PhoneProps {
  className?: string;
  children: ReactNode;
}
export const Phone = ({ className, children }: PhoneProps) => {
  return (
    <div
      aria-hidden="true"
      className={cn("jelly tint-neutral relative isolate w-fit rounded-[2.85rem] p-[0.45rem]", className)}
    >
      <div className="relative overflow-hidden rounded-[2.45rem] ring-1 ring-foreground/10">
        {children}
        <span className="pointer-events-none absolute top-[0.4rem] left-1/2 z-50 h-[1.35rem] w-20 -translate-x-1/2 rounded-full bg-black" />
      </div>
    </div>
  );
};

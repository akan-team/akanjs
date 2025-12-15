import { clsx } from "@akanjs/client";
import type { ReactNode } from "react";
import { AiOutlineLoading } from "react-icons/ai";

export interface SpinProps {
  indicator?: ReactNode;
  isCenter?: boolean;
  className?: string;
}
export const Spin = ({ indicator, isCenter, className }: SpinProps) => {
  return (
    <div className={clsx("inline-block py-1", className)}>
      <div className={isCenter ? "absolute inset-0 flex size-full flex-none items-center justify-center" : ""}>
        {indicator ? (
          <div className="[&>svg]:animate-spin">{indicator}</div>
        ) : (
          <AiOutlineLoading className="text-primary/60 animate-spin text-lg" />
        )}
      </div>
    </div>
  );
};

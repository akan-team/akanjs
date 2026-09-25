import { clsx } from "akanjs/client";
import type { ReactNode } from "react";

export interface ViewProps {
  /** Additional classes merged with the default detail page container. */
  className?: string;
  /** View content, usually a model detail component. */
  children: ReactNode;
}
export const View = ({ className, children }: ViewProps) => {
  return <div className={clsx("flex size-full max-w-5xl flex-col gap-6 px-2", className)}>{children}</div>;
};

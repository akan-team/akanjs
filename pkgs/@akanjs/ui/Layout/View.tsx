import { clsx } from "@akanjs/client";

export interface ViewProps {
  className?: string;
  children: any;
}
export const View = ({ className, children }: ViewProps) => {
  return <div className={clsx("flex size-full max-w-screen-lg flex-col gap-6 px-2", className)}>{children}</div>;
};

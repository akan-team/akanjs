import { clsx } from "@akanjs/client";

export interface ZoneProps {
  className?: string;
  children: any;
}
export const Zone = ({ className, children }: ZoneProps) => {
  return <div className={clsx("flex size-full max-w-screen-lg flex-col gap-6 px-2", className)}>{children}</div>;
};

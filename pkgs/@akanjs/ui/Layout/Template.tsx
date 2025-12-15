import { clsx } from "@akanjs/client";

export interface TemplateProps {
  className?: string;
  children?: React.ReactNode;
}
export const Template = ({ className, children }: TemplateProps) => {
  return <div className={clsx("flex w-full flex-col gap-6 p-2", className)}>{children}</div>;
};

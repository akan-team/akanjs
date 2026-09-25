import { clsx } from "akanjs/client";

export interface TemplateProps {
  /** Additional classes merged with the default vertical form/template spacing. */
  className?: string;
  /** Template content, usually Field components in a model form. */
  children?: React.ReactNode;
}
export const Template = ({ className, children }: TemplateProps) => {
  return <div className={clsx("flex w-full flex-col gap-6 p-2", className)}>{children}</div>;
};

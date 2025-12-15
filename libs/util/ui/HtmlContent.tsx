import { clsx } from "@akanjs/client";

interface HtmlContentProps {
  className?: string;
  content?: string;
  children?: any;
}
export const HtmlContent = ({ className, content, children }: HtmlContentProps) => {
  const proseClassName = "p-5 prose md:prose-sm lg:prose-base  w-full";
  return content ? (
    <div className={clsx(proseClassName, className)} dangerouslySetInnerHTML={{ __html: content }}></div>
  ) : (
    <div className={clsx(proseClassName, className)}>{children}</div>
  );
};

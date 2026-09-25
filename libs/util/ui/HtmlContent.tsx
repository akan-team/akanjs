import { cn } from "akanjs/client";

interface HtmlContentProps {
  className?: string;
  content?: string;
  children?: any;
}
export const HtmlContent = ({ className, content, children }: HtmlContentProps) => {
  const proseClassName = "p-5 prose md:prose-sm lg:prose-base  w-full";
  return content ? (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: rendering stored rich text is this component's entire purpose; callers sanitize upstream
    <div className={cn(proseClassName, className)} dangerouslySetInnerHTML={{ __html: content }}></div>
  ) : (
    <div className={cn(proseClassName, className)}>{children}</div>
  );
};

import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface HtmlContentProps {
  className?: string;
  trustedHtml?: string;
  children?: ReactNode;
}
export const HtmlContent = ({ className, trustedHtml, children }: HtmlContentProps) => {
  const proseClassName = "p-5 prose md:prose-sm lg:prose-base  w-full";
  return trustedHtml ? (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: nothing here sanitizes it; trustedHtml must be markup the app ships itself, never user or stored content
    <div className={cn(proseClassName, className)} dangerouslySetInnerHTML={{ __html: trustedHtml }}></div>
  ) : (
    <div className={cn(proseClassName, className)}>{children}</div>
  );
};

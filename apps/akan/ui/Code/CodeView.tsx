import { clsx } from "akanjs/client";
import { Clipboard } from "akanjs/ui";
import type { ReactNode } from "react";

interface CodeViewProps {
  className?: string;
  title?: string;
  children: ReactNode;
  copyText?: string;
  wrapperClassName?: string;
}

export const CodeView = ({ className, title, children, wrapperClassName, copyText }: CodeViewProps) => (
  <div className={clsx("flex justify-center", wrapperClassName)}>
    <div className={clsx("relative overflow-x-scroll rounded-md border border-base-300 bg-base-200", className)}>
      {title ? (
        <div className="sticky inset-x-0 top-0 flex h-10 w-full items-center justify-between border-base-300 border-b bg-base-100 pr-2 pl-4 font-bold text-base-content text-sm">
          {title}
          {copyText ? <Clipboard text={copyText} /> : null}
        </div>
      ) : null}
      {children}
    </div>
  </div>
);

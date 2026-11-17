import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: `${dict.Model}.Util.tsx`,
    content: `"use client";
import type { ReactNode } from "react";

interface ActionProps {
  className?: string;
  children?: ReactNode;
}
export const Action = ({ className, children }: ActionProps) => {
  return (
    <button type="button" className={className}>
      {children}
    </button>
  );
};
`,
  };
}

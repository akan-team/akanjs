import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  Model: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: `${dict.Model}.Zone.tsx`,
    content: `"use client";
import type { ReactNode } from "react";

interface MainProps {
  className?: string;
  children?: ReactNode;
}
export const Main = ({ className, children }: MainProps) => {
  return <section className={className}>{children}</section>;
};
`,
  };
}

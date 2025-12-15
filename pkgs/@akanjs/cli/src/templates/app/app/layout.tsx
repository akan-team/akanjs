/* eslint-disable @akanjs/lint/useClientByFile */
import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: "layout.tsx",
    content: `
"use client";
import { st } from "@${dict.appName}/client";
import { System } from "@akanjs/ui";

interface LayoutProps {
  children: React.ReactNode;
}
export default function Layout({ children }: LayoutProps) {
  return <System.Root st={st}>{children}</System.Root>;
}
  `,
  };
}

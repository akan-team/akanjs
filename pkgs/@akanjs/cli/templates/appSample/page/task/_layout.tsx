import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "_layout.tsx",
    content: `
// ===== page/task/_layout.tsx =====
// Convention: Akan.js file-based routing — _layout.tsx wraps every sub-page under /task/*.
// The underscores mark it as a routing file; children = sub-page component from nested routes.
// Rendered by Akan's router: URL → _layout.tsx → children (e.g., _index.tsx or [taskId]/_index.tsx).

interface LayoutProps {
  children: React.ReactNode;
}
export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-base-200">
      {children}
    </div>
  );
}
`,
  };
}

import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "GlobalLoading.tsx",
    content: `"use client";

import { cn } from "akanjs/client";

// ===== GlobalLoading.tsx =====
// Convention: ui/ folder — reusable visual components. PascalCase .tsx, "use client" directive.
// File name = exported component name.
// Scanned by akan sync into ui/index.ts barrel automatically.

interface GlobalLoadingProps {
  className?: string;
  message?: string;
}

export const GlobalLoading = ({ className, message = "Loading..." }: GlobalLoadingProps) => {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 py-32", className)}>
      <span className="inline-block size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-foreground/60 text-sm">{message}</span>
    </div>
  );
};
`,
  };
}

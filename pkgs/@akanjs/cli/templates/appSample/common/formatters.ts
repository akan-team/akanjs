import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "formatters.ts",
    content: `// ===== formatters.ts =====
// Convention: common/ folder — only pure functions that run on both server and client.
// Cannot import window, Bun, process.env, or any runtime-specific API.
// Naming: camelCase .ts, file name = primary export name.
// Scanned by akan sync into common/index.ts barrel automatically.

export function trimString(str: string, maxLength = 50, suffix = "...") {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

export function formatKebabToPascal(str: string) {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

// ---- Expandable additional fields: ----
// File size formatter: 1024 → "1 KB"
// export function formatBytes(bytes: number, decimals = 2) { ... }
//
// Relative date time: "3 hours ago", "just now"
// export function formatRelativeTime(date: Date) { ... }
`,
  };
}

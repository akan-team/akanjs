import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "validators.ts",
    content: `// ===== validators.ts =====
// Convention: common/ folder — only pure functions that run on both server and client.
// Cannot import window, Bun, process.env, or any runtime-specific API.
// Naming: camelCase .ts, file name = primary export name.
// Scanned by akan sync into common/index.ts barrel automatically.

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^s@]+@[^s@]+.[^s@]+$/;
  return emailRegex.test(email);
}

export function isValidTaskTitle(title: string): boolean {
  return title.trim().length > 0;
}

// ---- Expandable additional fields: ----
// URL validation
// export function isValidUrl(url: string) { try { new URL(url); return true; } catch { return false; } }
//
// Password strength check (8+ chars, special character)
// export function isStrongPassword(password: string) { ... }
//
// Phone number format validation
// export function isValidPhone(phone: string, locale = "KR") { ... }
`,
  };
}

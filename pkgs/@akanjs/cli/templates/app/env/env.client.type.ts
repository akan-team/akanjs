import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  [key: string]: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict = {}) {
  return `
// Replace with the public env keys this app reads, e.g. { google?: { mapKey: string } }.
export type AppClientEnv = Record<never, never>;
  `;
}

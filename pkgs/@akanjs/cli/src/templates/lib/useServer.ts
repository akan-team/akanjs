import type { AppInfo, LibInfo } from "@akanjs/devkit";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  return `
import type { fetch as sigFetch } from "./sig";

export const fetch = global.fetch as unknown as typeof sigFetch;
`;
}

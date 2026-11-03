import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `import type { AppConfig } from "akanjs";

const config: AppConfig = {};

export default config;
`;
}

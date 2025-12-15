import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  [key: string]: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict = {}) {
  return `
import { env as debug } from "./env.client.debug";
import { env as develop } from "./env.client.develop";
import { env as local } from "./env.client.local";
import { env as main } from "./env.client.main";
import { env as testing } from "./env.client.testing";

const envConfigs = { debug, testing, develop, main, local };
const currentEnv = process.env.NEXT_PUBLIC_ENV ?? "local";
if (!(currentEnv in envConfigs)) throw new Error(\`Unknown environment: \${currentEnv}\`);

export const env = envConfigs[currentEnv as keyof typeof envConfigs];

  `;
}

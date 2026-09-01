import type { ClientEnv } from "akanjs/base";

export type AppClientEnv = ClientEnv & {
  google?: {
    mapKey: string;
  };
  cloudflare?: {
    siteKey: string;
  };
};

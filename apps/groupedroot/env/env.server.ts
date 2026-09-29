import { env as debug } from "./env.server.debug";
import { env as develop } from "./env.server.develop";
import { env as local } from "./env.server.local";
import { env as main } from "./env.server.main";
import { env as testing } from "./env.server.testing";

const envConfigs = { debug, testing, develop, main, local };
const currentEnv = process.env.AKAN_PUBLIC_ENV ?? "local";
if (!(currentEnv in envConfigs)) throw new Error(`Unknown environment: ${currentEnv}`);

export const env = envConfigs[currentEnv as keyof typeof envConfigs];

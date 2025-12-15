import type { ModulesOptions } from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: ModulesOptions = {
  ...libEnv,
  rootAdminInfo: { accountId: "my-admin@my-domain.com", password: "admin1234" },
};

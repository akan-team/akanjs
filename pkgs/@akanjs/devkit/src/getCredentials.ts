import fs from "fs";
import yaml from "js-yaml";

import type { AppExecutor } from "./executors";

export interface AppSecret {
  mongo: { account: { user: { username: string; password: string } } };
}
interface Secret {
  [key: string]: AppSecret;
}

export const getCredentials = (app: AppExecutor, environment: string): AppSecret => {
  const secret = yaml.load(
    fs.readFileSync(`${app.workspace.workspaceRoot}/infra/app/values/${app.name}-secret.yaml`, "utf-8")
  ) as Secret;
  return secret[environment];
};

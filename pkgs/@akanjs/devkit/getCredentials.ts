import yaml from "js-yaml";

import type { AppExecutor } from "./executors";
import { FileSys } from "./fileSys";

export interface AppSecret {
  postgres?: { account?: { user?: { username: string; password: string } } };
}
interface Secret {
  [key: string]: AppSecret;
}

export const getCredentials = async (app: AppExecutor, environment: string): Promise<AppSecret> => {
  const content = await FileSys.readText(`${app.workspace.workspaceRoot}/infra/app/values/${app.name}-secret.yaml`);
  const secret = yaml.load(content) as Secret;
  const appSecret = secret[environment];
  if (!appSecret) throw new Error(`No secret found for ${app.name} in ${environment}`);
  return appSecret;
};

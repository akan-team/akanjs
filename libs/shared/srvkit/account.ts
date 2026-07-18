import { type Environment, getEnv } from "akanjs/base";

export type SerAccount<AddData = unknown> = {
  appName: string;
  environment: Environment;
} & AddData;
export const getDefaultAccount = (): SerAccount => {
  const env = getEnv();
  return { appName: env.appName, environment: env.environment };
};

export type AuthTokenMeta = { exp?: number; iat?: number; jti?: string; sid?: string; tokenType?: string };

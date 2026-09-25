import { createHash } from "node:crypto";
import { type BackendEnv, type BaseEnv, type Environment, getEnv } from "akanjs/base";
import { Logger } from "akanjs/common";
import { jwtVerify } from "./jwt";

interface ResolvedToken {
  appName: string;
  environment: Environment;
}
export const resolveJwt = async <Resolved extends ResolvedToken>(
  secret: string,
  authorization: string | undefined,
  defaultResolved: Resolved,
): Promise<Resolved> => {
  const [type, token] = authorization?.split(" ") ?? [undefined, undefined];
  if (!token || type !== "Bearer") return defaultResolved;
  try {
    const resolved = (await jwtVerify(token, secret)) as Resolved;
    if (resolved.appName !== getEnv().appName || resolved.environment !== getEnv().environment) return defaultResolved;
    return resolved;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    Logger.warn(`failed to verify token for ${authorization}: ${message}`);
    return defaultResolved;
  }
};

const generateHexStringFromSeed = (seed: string, length = 256) => {
  let hexString = "";
  let currentSeed = seed;
  while (hexString.length < length * 2) {
    const hash = createHash("sha256").update(currentSeed).digest("hex");
    hexString += hash;
    currentSeed = hash;
  }
  return hexString.substring(0, length * 2);
};

export const generateJwtSecret = (appName: string, environment: BaseEnv["environment"]) => {
  const seed = `${appName}-${environment}-jwt-secret`;
  return generateHexStringFromSeed(seed);
};

export const generateAeskey = (appName: string, environment: BaseEnv["environment"]) => {
  const seed = `${appName}-${environment}-aes-key`;
  return createHash("sha256").update(seed).digest("hex");
};

export const generateHost = (env: BackendEnv) => {
  if (process.env.HOST_NAME) return process.env.HOST_NAME;
  else if (env.hostname) return env.hostname;
  else if (env.operationMode === "local") return "localhost";
  else return `${env.appName}-${env.environment}.${getEnv().serveDomain}`;
};

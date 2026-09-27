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
  // McpAuth's parse, exactly: a token read here that /mcp's gate ignores would skip its aud and expiry checks.
  const token = /^Bearer +([^ ]+)/i.exec(authorization ?? "")?.[1];
  if (!token) return defaultResolved;
  try {
    const resolved = (await jwtVerify(token, secret)) as Resolved;
    if (resolved.appName !== getEnv().appName || resolved.environment !== getEnv().environment) return defaultResolved;
    return resolved;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    Logger.verbose(`failed to verify a bearer token: ${message}`);
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

export const generateJwtSecret = (
  appName: string,
  environment: BaseEnv["environment"],
  repoWideSeed = "jwt-secret",
) => {
  const seed = `${appName}-${environment}-${repoWideSeed}`;
  return generateHexStringFromSeed(seed);
};

export const resolveJwtSecret = (
  appName: string,
  environment: BaseEnv["environment"],
  configuredSecret?: string,
  repoWideSeed?: string,
) =>
  process.env.JWT_SECRET ??
  configuredSecret ??
  generateJwtSecret(appName, environment, repoWideSeed ?? getEnv().repoName);

export const generateAeskey = (appName: string, environment: BaseEnv["environment"], repoWideSeed = "aes-key") => {
  const seed = `${appName}-${environment}-${repoWideSeed}`;
  return createHash("sha256").update(seed).digest("hex");
};

export const generateHost = (options: BackendEnv) => {
  const env = getEnv();
  if (process.env.HOST_NAME) return process.env.HOST_NAME;
  else if (options.hostname) return options.hostname;
  else if (env.operationMode === "local") return "localhost";
  else return `${env.appName}-${env.environment}.${getEnv().serveDomain}`;
};

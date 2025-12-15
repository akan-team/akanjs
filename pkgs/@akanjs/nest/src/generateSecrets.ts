import { BackendEnv, type BaseEnv, baseEnv } from "@akanjs/base";
import { createHash } from "crypto";
import { createTunnel, ForwardOptions, ServerOptions, SshOptions, type TunnelOptions } from "tunnel-ssh";

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

const DEFAULT_CLOUD_PORT = 30000;
const getEnvironmentPort = (environment: BaseEnv["environment"]) =>
  environment === "main" ? 2000 : environment === "develop" ? 1000 : environment === "debug" ? 0 : 0;
const getServicePort = (service: "redis" | "mongo" | "meili") =>
  service === "redis" ? 300 : service === "mongo" ? 400 : 500; // + (appCode % 10) * 10 + (appCode >= 10 ? 5 : 0);

interface TunnelOption {
  appName: string;
  environment: BaseEnv["environment"];
  type: "redis" | "mongo" | "meili";
  port: number;
  sshOptions?: SshOptions;
}
const createDatabaseTunnel = async ({
  appName,
  environment,
  type,
  port,
  sshOptions = {
    host: `${appName}-${environment}.${baseEnv.serveDomain}`,
    port: 32767,
    username: baseEnv.tunnelUsername,
    password: baseEnv.tunnelPassword,
  },
}: TunnelOption) => {
  const tunnelOptions: TunnelOptions = { autoClose: true, reconnectOnError: false };
  const serverOptions: ServerOptions = { port };
  const forwardOptions: ForwardOptions = {
    srcAddr: "0.0.0.0",
    srcPort: port,
    dstAddr: `${type}-0.${type}-svc.${appName}-${environment}`,
    dstPort: type === "mongo" ? 27017 : type === "redis" ? 6379 : 7700,
  };
  const [server, client] = await createTunnel(tunnelOptions, serverOptions, sshOptions, forwardOptions);
  return `localhost:${port}`;
};

interface RedisEnv {
  appName: string;
  environment: BaseEnv["environment"];
  operationMode: BaseEnv["operationMode"];
  sshOptions?: SshOptions;
}
export const generateRedisUri = async ({ appName, environment, operationMode, sshOptions }: RedisEnv) => {
  if (process.env.REDIS_URI) return process.env.REDIS_URI;
  else if (environment === "local") return "redis://localhost:6379";
  const port =
    operationMode === "local" ? DEFAULT_CLOUD_PORT + getEnvironmentPort(environment) + getServicePort("redis") : 6379;
  const url =
    operationMode === "cloud"
      ? `redis-svc.${appName}-${environment}.svc.cluster.local`
      : operationMode === "local"
        ? await createDatabaseTunnel({ appName, environment, type: "redis", port, sshOptions })
        : "localhost:6379";
  const uri = `redis://${url}`;
  return uri;
};

interface MongoEnv {
  appName: string;
  environment: BaseEnv["environment"];
  operationMode: BaseEnv["operationMode"];
  username?: string;
  password?: string;
  sshOptions?: SshOptions;
}
export const generateMongoUri = async ({
  appName,
  environment,
  operationMode,
  username = `${appName}-${environment}-mongo-user`,
  password,
  sshOptions,
}: MongoEnv) => {
  const dbName = `${appName}-${environment}`;
  if (process.env.MONGO_URI) return process.env.MONGO_URI;
  else if (environment === "local") return `mongodb://localhost:27017/${dbName}`;

  const record = operationMode === "cloud" ? "mongodb+srv" : "mongodb";
  const port =
    operationMode === "local" ? DEFAULT_CLOUD_PORT + getEnvironmentPort(environment) + getServicePort("mongo") : 27017;
  const url =
    operationMode === "cloud"
      ? `mongo-svc.${appName}-${environment}.svc.cluster.local`
      : operationMode === "local"
        ? await createDatabaseTunnel({ appName, environment, type: "mongo", port, sshOptions })
        : "localhost:27017";
  const usernameEncoded = password ? encodeURIComponent(username) : null;
  const passwordEncoded = password ? encodeURIComponent(password) : null;
  const directConnection = operationMode === "cloud" ? false : true;
  const authInfo = usernameEncoded ? `${usernameEncoded}:${passwordEncoded}@` : "";
  const uri = `${record}://${authInfo}${url}/${dbName}?authSource=${dbName}&readPreference=primary&ssl=false&retryWrites=true&directConnection=${directConnection}`;
  return uri;
};

interface MeiliEnv {
  appName: string;
  environment: BaseEnv["environment"];
  operationMode: BaseEnv["operationMode"];
}
export const generateMeiliUri = async ({ appName, environment, operationMode }: MeiliEnv) => {
  if (process.env.MEILI_URI) return process.env.MEILI_URI;
  else if (environment === "local") return "http://localhost:7700";
  const protocol = operationMode === "local" ? "https" : "http";
  const url =
    operationMode === "cloud"
      ? `meili-0.meili-svc.${appName}-${environment}.svc.cluster.local:7700`
      : operationMode === "local"
        ? `${appName}-${environment}.${baseEnv.serveDomain}/search`
        : "localhost:7700";
  const uri = `${protocol}://${url}`;
  return await Promise.resolve(uri);
};

export const SALT_ROUNDS = 11;

export const generateHost = (env: BackendEnv) => {
  if (process.env.HOST_NAME) return process.env.HOST_NAME;
  else if (env.hostname) return env.hostname;
  else if (env.operationMode === "local") return "localhost";
  else return `${env.appName}-${env.environment}.${baseEnv.serveDomain}`;
};

export const generateMeiliKey = ({ appName, environment }: { appName: string; environment: string }) => {
  if (process.env.MEILI_MASTER_KEY) return process.env.MEILI_MASTER_KEY;
  else if (environment === "local") return "masterKey";
  return `meilisearch-key-${appName}-${environment}`;
};

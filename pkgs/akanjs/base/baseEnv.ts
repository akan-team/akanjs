type ProcessEnvLike = { env?: Record<string, string | undefined> };

const globalWithProcess = globalThis as unknown as { process?: ProcessEnvLike };

globalWithProcess.process ??= {};
globalWithProcess.process.env ??= {};

export type Environment = "testing" | "debug" | "develop" | "main" | "local";
export type DatabaseMode = "single" | "multiple" | "cluster";
export interface BaseEnv {
  repoName: string;
  serveDomain: string;
  appName: string;
  environment: Environment;
  operationMode: "local" | "edge" | "cloud" | "module";
  tunnelUsername: string;
  tunnelPassword: string;
  databaseMode?: DatabaseMode;
}
export type BackendEnv = BaseEnv & {
  hostname?: string | null;
  port?: number;
  database?: {
    mode?: DatabaseMode;
    driver?: "sqlite" | "libsql" | "postgres";
    sqlite?: {
      filePath?: string;
      journalMode?: string;
      busyTimeoutMs?: number;
      synchronous?: string;
      foreignKeys?: boolean;
      cacheSize?: number;
      tempStore?: string;
    };
    libsql?: {
      url?: string;
      authToken?: string;
    };
    postgres?: {
      url?: string;
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
    };
  };
  solid?: {
    filePath?: string;
    journalMode?: string;
    busyTimeoutMs?: number;
    synchronous?: string;
    cleanupIntervalMs?: number;
    queuePollIntervalMs?: number;
    queueLeaseMs?: number;
  };
  onCleanup?: () => Promise<void>;
};

export type ClientEnv = BaseEnv & {
  side: "server" | "client";
  renderMode: "ssr" | "csr";
  websocket: boolean;
  clientHost: string;
  clientPort: number;
  clientHttpProtocol: "http:" | "https:";
  clientHttpUri: string;
  serverHost: string;
  serverPort: number;
  serverHttpProtocol: "http:" | "https:";
  serverHttpUri: string;
  serverWsProtocol: "ws:" | "wss:";
  serverWsUri: string;
};

let cachedEnv: ClientEnv | undefined;

/** Reads and caches Akan runtime environment values from process/browser environment settings. */
export const getEnv = (): ClientEnv => {
  if (cachedEnv) return cachedEnv;
  const appName = process.env.AKAN_PUBLIC_APP_NAME ?? "unknown";
  const repoName = process.env.AKAN_PUBLIC_REPO_NAME ?? "unknown";
  const serveDomain = process.env.AKAN_PUBLIC_SERVE_DOMAIN ?? "unknown";
  if (appName === "unknown") throw new Error("environment variable AKAN_PUBLIC_APP_NAME is required");
  if (repoName === "unknown") throw new Error("environment variable AKAN_PUBLIC_REPO_NAME is required");
  if (serveDomain === "unknown") throw new Error("environment variable AKAN_PUBLIC_SERVE_DOMAIN is required");
  const environment = (process.env.AKAN_PUBLIC_ENV ?? "debug") as BaseEnv["environment"];
  const operationMode = (process.env.AKAN_PUBLIC_OPERATION_MODE ??
    (environment === "local" ? "local" : "cloud")) as BaseEnv["operationMode"];
  const tunnelUsername = process.env.SSH_TUNNEL_USERNAME ?? "root";
  const tunnelPassword = process.env.SSH_TUNNEL_PASSWORD ?? repoName;
  const baseEnv: BaseEnv = {
    repoName,
    serveDomain,
    appName,
    environment,
    operationMode,
    tunnelUsername,
    tunnelPassword,
    databaseMode: process.env.AKAN_DATABASE_MODE as DatabaseMode | undefined,
  } as const;
  const side = typeof window === "undefined" ? "server" : "client";
  const renderMode = (process.env.AKAN_PUBLIC_RENDER_ENV ?? "csr") as ClientEnv["renderMode"];
  const clientHost =
    process.env.AKAN_PUBLIC_CLIENT_HOST ??
    (operationMode === "local" || side === "server" ? "localhost" : window.location.hostname);
  const clientPort =
    side === "server"
      ? parseInt(process.env.AKAN_PUBLIC_CLIENT_PORT ?? (operationMode === "local" ? "8282" : "443"))
      : parseInt(window.location.port || (window.location.protocol === "https:" ? "443" : "80"));

  const clientHttpProtocol =
    side === "client"
      ? (window.location.protocol as "http:" | "https:")
      : clientHost === "localhost"
        ? "http:"
        : "https:";
  const clientHttpUri = `${clientHttpProtocol}//${clientHost}${clientPort === 443 ? "" : `:${clientPort}`}`;
  const serverHost =
    process.env.SERVER_HOST ??
    (operationMode === "local"
      ? typeof window === "undefined"
        ? "localhost"
        : (window.location.host.split(":")[0] ?? "unknown")
      : renderMode === "csr"
        ? `${appName}-${environment}.${serveDomain}`
        : side === "client"
          ? (window.location.host.split(":")[0] ?? "unknown")
          : "localhost");

  const serverPort =
    side === "server"
      ? parseInt(process.env.AKAN_PUBLIC_SERVER_PORT ?? "8282")
      : parseInt(window.location.port || (window.location.protocol === "https:" ? "443" : "80"));

  const serverHttpProtocol: "http:" | "https:" =
    (process.env.SERVER_HTTP_PROTOCOL as "http:" | "https:" | undefined) ??
    (operationMode === "local"
      ? side === "client"
        ? (window.location.protocol as "http:" | "https:")
        : ("http:" as const)
      : renderMode === "csr"
        ? ("https:" as const)
        : side === "client"
          ? (window.location.protocol as "http:" | "https:")
          : ("http:" as const));
  const serverHttpUri = `${serverHttpProtocol}//${serverHost}${serverPort === 443 ? "" : `:${serverPort}`}/api`;
  const serverWsProtocol = serverHttpProtocol === "http:" ? "ws:" : "wss:";
  const serverWsUri = `${serverWsProtocol}//${serverHost}${serverPort === 443 ? "" : `:${serverPort}`}`;

  const env: ClientEnv = {
    ...baseEnv,
    side,
    renderMode,
    websocket: true,
    clientHost,
    clientPort,
    clientHttpProtocol,
    clientHttpUri,
    serverHost,
    serverPort,
    serverHttpProtocol,
    serverHttpUri,
    serverWsProtocol,
    serverWsUri,
  } as const;
  cachedEnv = env;
  return env;
};

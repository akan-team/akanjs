import { DatabaseModes } from "./databaseModes";

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
  databaseMode?: DatabaseMode;
}
export type BackendEnv = {
  hostname?: string | null;
  port?: number;
  database?: {
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
      insightUrl?: string;
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
    queueFailedRetentionMs?: number;
  };
  onCleanup?: () => Promise<void>;
};

export type ClientEnv = BaseEnv & {
  side: "server" | "client";
  renderMode: "ssr" | "csr";
  websocket: boolean;
  apiPrefix: string;
  wsPrefix: string;
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

type RoutePrefixOverride = { api?: string; ws?: string };

const globalWithPrefix = globalThis as typeof globalThis & { __AKAN_PREFIX__?: RoutePrefixOverride };

/** Leading slash, no trailing slash; a blank value or a bare `/` (it would swallow every page route) is no prefix. */
export const normalizeRoutePrefix = (value: string | undefined | null): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const normalized = `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? undefined : normalized;
};

/**
 * Narrowest first: the SSR bootstrap global, then `AKAN_API_PREFIX` (outside `AKAN_PUBLIC_*`, which is inlined at build
 * time, so it can override at runtime), then the build-time default. Written out: a computed `process.env[...]` escapes
 * the bundler's define pass.
 */
export const getApiPrefix = (): string =>
  normalizeRoutePrefix(globalWithPrefix.__AKAN_PREFIX__?.api) ??
  normalizeRoutePrefix(process.env.AKAN_API_PREFIX) ??
  normalizeRoutePrefix(process.env.AKAN_PUBLIC_API_PREFIX) ??
  "/api";

export const getWsPrefix = (): string =>
  normalizeRoutePrefix(globalWithPrefix.__AKAN_PREFIX__?.ws) ??
  normalizeRoutePrefix(process.env.AKAN_WS_PREFIX) ??
  normalizeRoutePrefix(process.env.AKAN_PUBLIC_WS_PREFIX) ??
  "/ws";

/** `AkanApp` rewrites `process.env` for the replica it runs in-process, after this module may already have cached. */
export const resetEnvCache = () => {
  cachedEnv = undefined;
};

// Read by a CSR bundle only: an SSR tab calls the origin that rendered it, and a server calls itself.
//* A desktop app that carries its own server learns the loopback port only at launch, so the value the shell hands the
//* page in `__AKAN_NATIVE__.env` outranks the one built into the bundle.
const csrServerUrl = (): URL | null => {
  const runtime = (globalThis as { __AKAN_NATIVE__?: { env?: Record<string, string | undefined> } }).__AKAN_NATIVE__
    ?.env?.PUBLIC_AKAN_SERVER_URL;
  const [key, value] = runtime
    ? ["PUBLIC_AKAN_SERVER_URL", runtime]
    : ["AKAN_PUBLIC_SERVER_URL", process.env.AKAN_PUBLIC_SERVER_URL];
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error(`${key} must be an http(s) URL, got "${value}".`);
  return url;
};

//* A native dev build's page comes from the akan-native dev gateway on the app origin, and the gateway carries its API
//* calls and sockets to the dev server as well, so the page calls its own origin: the path a phone on Wi-Fi takes too.
//* The gateway's page shim marks the page; a debug build with no gateway behind it is not marked.
const nativeDevGatewayOrigin = (): string | null =>
  (globalThis as { __AKAN_NATIVE_DEV__?: { gateway?: string } }).__AKAN_NATIVE_DEV__?.gateway
    ? `${window.location.protocol}//${window.location.host}`
    : null;

const devServerOrigin = () => `http://localhost:${process.env.AKAN_PUBLIC_SERVER_PORT ?? "8282"}`;

//* A release build has no gateway behind it, so in local mode it calls the dev server itself.
const nativeDevServerUrl = (operationMode: BaseEnv["operationMode"]): URL | null => {
  const platform = (globalThis as { __AKAN_NATIVE__?: { platform?: string } }).__AKAN_NATIVE__?.platform;
  if (operationMode !== "local" || !platform || platform === "web") return null;
  return new URL(devServerOrigin());
};

const missingPublicEnv = (key: string) =>
  `getEnv() cannot run at build time: akan build does not inject ${key}. Call it from a runtime function instead of at module scope (e.g. env(() => getEnv()) in adapt(), a method body, or a default thunk).`;

/** Cached after the first call. */
export const getEnv = (): ClientEnv => {
  if (cachedEnv) return cachedEnv;
  const appName = process.env.AKAN_PUBLIC_APP_NAME ?? "unknown";
  const repoName = process.env.AKAN_PUBLIC_REPO_NAME ?? "unknown";
  const serveDomain = process.env.AKAN_PUBLIC_SERVE_DOMAIN ?? "unknown";
  if (appName === "unknown") throw new Error(missingPublicEnv("AKAN_PUBLIC_APP_NAME"));
  if (repoName === "unknown") throw new Error(missingPublicEnv("AKAN_PUBLIC_REPO_NAME"));
  if (serveDomain === "unknown") throw new Error(missingPublicEnv("AKAN_PUBLIC_SERVE_DOMAIN"));
  const environment = (process.env.AKAN_PUBLIC_ENV ?? "debug") as BaseEnv["environment"];
  const operationMode = (process.env.AKAN_PUBLIC_OPERATION_MODE ??
    (environment === "local" ? "local" : "cloud")) as BaseEnv["operationMode"];
  const baseEnv: BaseEnv = {
    repoName,
    serveDomain,
    appName,
    environment,
    operationMode,
    databaseMode:
      typeof window === "undefined"
        ? DatabaseModes.settle({
            requested: process.env.AKAN_DATABASE_MODE,
            declared: process.env.AKAN_DATABASE_MODES,
            local: environment === "local" || operationMode === "local",
          })
        : undefined,
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
  const csrClient = side === "client" && renderMode === "csr";
  const pinnedServerUrl = csrClient ? csrServerUrl() : null;
  const pageOrigin = csrClient && !pinnedServerUrl ? nativeDevGatewayOrigin() : null;
  const serverUrl = csrClient && !pageOrigin ? (pinnedServerUrl ?? nativeDevServerUrl(operationMode)) : null;
  // The port belongs to whoever named the host: a cloud CSR bundle's host is not the page's.
  const hostFromPage =
    side === "client" && !serverUrl && (!!pageOrigin || operationMode === "local" || renderMode !== "csr");
  const serverHost =
    (pageOrigin ? window.location.hostname : serverUrl?.hostname) ??
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

  // A `localhost` server origin is this process calling itself, so it must use the port `AkanApp` bound (`PORT`); a
  // `SERVER_HOST` naming another host is not a self-call and keeps the explicit port.
  const selfServerPort = serverHost === "localhost" ? process.env.PORT : undefined;
  const serverPort =
    side === "server"
      ? parseInt(process.env.AKAN_PUBLIC_SERVER_PORT ?? selfServerPort ?? "8282")
      : serverUrl
        ? parseInt(serverUrl.port || (serverUrl.protocol === "https:" ? "443" : "80"))
        : hostFromPage
          ? parseInt(window.location.port || (window.location.protocol === "https:" ? "443" : "80"))
          : 443;

  const serverHttpProtocol: "http:" | "https:" =
    ((pageOrigin ? window.location.protocol : serverUrl?.protocol) as "http:" | "https:" | undefined) ??
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
  const apiPrefix = getApiPrefix();
  const wsPrefix = getWsPrefix();
  //? iOS serves the page on app://localhost, which has no default port to leave out, so the origin is taken whole.
  const serverHttpUri = pageOrigin
    ? `${pageOrigin}${apiPrefix}`
    : `${serverHttpProtocol}//${serverHost}${serverPort === 443 ? "" : `:${serverPort}`}${apiPrefix}`;
  const serverWsProtocol = serverHttpProtocol === "http:" ? "ws:" : "wss:";
  const serverWsUri = pageOrigin
    ? pageOrigin.replace(/^http/, "ws")
    : `${serverWsProtocol}//${serverHost}${serverPort === 443 ? "" : `:${serverPort}`}`;

  const env: ClientEnv = {
    ...baseEnv,
    side,
    renderMode,
    websocket: true,
    apiPrefix,
    wsPrefix,
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

//* The server as a browser outside the page opens it — the system browser a native sign-in hands off to. A page the
//* native dev gateway served calls it on the app's own origin, which no other browser can open, so that one names
//* the dev server behind the gateway: the origin an OAuth redirect_uri is registered for.
export const getServerOrigin = (): string => {
  const env = getEnv();
  const behindGateway =
    env.side === "client" && env.renderMode === "csr" && !csrServerUrl() && !!nativeDevGatewayOrigin();
  return behindGateway ? devServerOrigin() : new URL(env.serverHttpUri).origin;
};

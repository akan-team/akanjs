import { afterAll, describe, expect, test } from "bun:test";

type BaseEnvModule = typeof import("./baseEnv");

const preservedEnv = { ...process.env };
let importCount = 0;

const envKeys = [
  "AKAN_PUBLIC_APP_NAME",
  "AKAN_PUBLIC_REPO_NAME",
  "AKAN_PUBLIC_SERVE_DOMAIN",
  "AKAN_PUBLIC_ENV",
  "AKAN_PUBLIC_OPERATION_MODE",
  "AKAN_PUBLIC_RENDER_ENV",
  "AKAN_PUBLIC_CLIENT_HOST",
  "AKAN_PUBLIC_CLIENT_PORT",
  "SERVER_HOST",
  "AKAN_PUBLIC_SERVER_PORT",
  "PORT",
  "SERVER_HTTP_PROTOCOL",
  "SSH_TUNNEL_USERNAME",
  "SSH_TUNNEL_PASSWORD",
  "AKAN_API_PREFIX",
  "AKAN_WS_PREFIX",
  "AKAN_PUBLIC_API_PREFIX",
  "AKAN_PUBLIC_WS_PREFIX",
] as const;

const resetEnv = () => {
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, {
    AKAN_PUBLIC_APP_NAME: "minimal",
    AKAN_PUBLIC_REPO_NAME: "akan",
    AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  });
};

const loadBaseEnv = async (): Promise<BaseEnvModule> => {
  importCount++;
  return import(`./baseEnv.ts?test=${importCount}`);
};

describe("getEnv", () => {
  test("throws when required public environment variables are missing", async () => {
    resetEnv();
    delete process.env.AKAN_PUBLIC_APP_NAME;

    const { getEnv } = await loadBaseEnv();

    expect(() => getEnv()).toThrow(
      "getEnv() cannot run at build time: akan build does not inject AKAN_PUBLIC_APP_NAME. Call it from a runtime function instead of at module scope (e.g. env(() => getEnv()) in adapt(), a method body, or a default thunk).",
    );
  });

  test("builds default server-side cloud client environment", async () => {
    resetEnv();
    process.env.AKAN_PUBLIC_ENV = "main";

    const { getEnv } = await loadBaseEnv();
    const env = getEnv();

    expect(env).toEqual({
      repoName: "akan",
      serveDomain: "example.com",
      appName: "minimal",
      environment: "main",
      operationMode: "cloud",
      databaseMode: "single",
      side: "server",
      renderMode: "csr",
      websocket: true,
      apiPrefix: "/api",
      wsPrefix: "/ws",
      clientHost: "localhost",
      clientPort: 443,
      clientHttpProtocol: "http:",
      clientHttpUri: "http://localhost",
      serverHost: "minimal-main.example.com",
      serverPort: 8282,
      serverHttpProtocol: "https:",
      serverHttpUri: "https://minimal-main.example.com:8282/api",
      serverWsProtocol: "wss:",
      serverWsUri: "wss://minimal-main.example.com:8282",
    });
  });

  test("uses local defaults for csr and ssr render modes", async () => {
    resetEnv();
    process.env.AKAN_PUBLIC_ENV = "local";

    const csrModule = await loadBaseEnv();
    expect(csrModule.getEnv().operationMode).toBe("local");
    expect(csrModule.getEnv().clientPort).toBe(8282);
    expect(csrModule.getEnv().serverHttpUri).toBe("http://localhost:8282/api");
    expect(csrModule.getEnv().serverWsUri).toBe("ws://localhost:8282");

    resetEnv();
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";

    const ssrModule = await loadBaseEnv();
    expect(ssrModule.getEnv().operationMode).toBe("local");
    expect(ssrModule.getEnv().clientPort).toBe(8282);
  });

  test("honors explicit host, port, protocol, and network overrides without exposing tunnel credentials", async () => {
    resetEnv();
    Object.assign(process.env, {
      AKAN_PUBLIC_ENV: "develop",
      AKAN_PUBLIC_OPERATION_MODE: "edge",
      AKAN_PUBLIC_NETWORK_TYPE: "debugnet",
      AKAN_PUBLIC_CLIENT_HOST: "client.example.com",
      AKAN_PUBLIC_CLIENT_PORT: "3000",
      SERVER_HOST: "api.example.com",
      AKAN_PUBLIC_SERVER_PORT: "9443",
      SERVER_HTTP_PROTOCOL: "https:",
      SSH_TUNNEL_USERNAME: "admin",
      SSH_TUNNEL_PASSWORD: "secret",
    });

    const { getEnv } = await loadBaseEnv();
    const env = getEnv();

    expect(env.environment).toBe("develop");
    expect(env.operationMode).toBe("edge");
    expect("tunnelUsername" in env).toBe(false);
    expect("tunnelPassword" in env).toBe(false);
    expect(env.clientHost).toBe("client.example.com");
    expect(env.clientPort).toBe(3000);
    expect(env.clientHttpUri).toBe("https://client.example.com:3000");
    expect(env.serverHost).toBe("api.example.com");
    expect(env.serverPort).toBe(9443);
    expect(env.serverHttpUri).toBe("https://api.example.com:9443/api");
    expect(env.serverWsUri).toBe("wss://api.example.com:9443");
  });

  test("a loopback server origin follows the port the process was run with", async () => {
    resetEnv();
    process.env.AKAN_PUBLIC_ENV = "main";
    process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";
    process.env.PORT = "80";

    const { getEnv } = await loadBaseEnv();
    const env = getEnv();

    expect(env.serverHost).toBe("localhost");
    expect(env.serverPort).toBe(80);
    expect(env.serverHttpUri).toBe("http://localhost:80/api");
  });

  test("an explicit server port outranks PORT, and a remote server host ignores it", async () => {
    resetEnv();
    process.env.AKAN_PUBLIC_ENV = "main";
    process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";
    process.env.PORT = "80";
    process.env.AKAN_PUBLIC_SERVER_PORT = "9443";

    const explicit = await loadBaseEnv();
    expect(explicit.getEnv().serverPort).toBe(9443);

    resetEnv();
    process.env.AKAN_PUBLIC_ENV = "main";
    process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";
    process.env.PORT = "80";
    process.env.SERVER_HOST = "api.example.com";

    const remote = await loadBaseEnv();
    expect(remote.getEnv().serverPort).toBe(8282);
  });

  test("caches the computed environment per module instance", async () => {
    resetEnv();

    const { getEnv } = await loadBaseEnv();
    const first = getEnv();

    process.env.AKAN_PUBLIC_APP_NAME = "changed";
    const second = getEnv();

    expect(second).toBe(first);
    expect(second.appName).toBe("minimal");
  });
});

describe("route prefixes", () => {
  const globalWithPrefix = globalThis as typeof globalThis & { __AKAN_PREFIX__?: { api?: string; ws?: string } };

  const load = async () => {
    resetEnv();
    delete globalWithPrefix.__AKAN_PREFIX__;
    return await loadBaseEnv();
  };

  test("defaults to /api and /ws", async () => {
    const { getApiPrefix, getWsPrefix } = await load();
    expect(getApiPrefix()).toBe("/api");
    expect(getWsPrefix()).toBe("/ws");
  });

  test("falls back to the build-time public env", async () => {
    const { getApiPrefix, getWsPrefix } = await load();
    process.env.AKAN_PUBLIC_API_PREFIX = "backend";
    process.env.AKAN_PUBLIC_WS_PREFIX = "socket/";
    expect(getApiPrefix()).toBe("/backend");
    expect(getWsPrefix()).toBe("/socket");
  });

  test("the runtime env outranks the build-time one, and the global outranks both", async () => {
    const { getApiPrefix } = await load();
    process.env.AKAN_PUBLIC_API_PREFIX = "/built";
    process.env.AKAN_API_PREFIX = "/deployed";
    expect(getApiPrefix()).toBe("/deployed");
    globalWithPrefix.__AKAN_PREFIX__ = { api: "/rendered" };
    expect(getApiPrefix()).toBe("/rendered");
    delete globalWithPrefix.__AKAN_PREFIX__;
  });

  // A prefix of "/" would be mounted ahead of the SSR catch-all and swallow every page route.
  test("a blank or root value is no prefix and falls through", async () => {
    const { getApiPrefix, normalizeRoutePrefix } = await load();
    process.env.AKAN_API_PREFIX = "/";
    process.env.AKAN_PUBLIC_API_PREFIX = "  ";
    expect(getApiPrefix()).toBe("/api");
    expect(normalizeRoutePrefix("///")).toBeUndefined();
    expect(normalizeRoutePrefix("/nested/path/")).toBe("/nested/path");
  });

  test("serverHttpUri follows the resolved api prefix", async () => {
    const { getEnv } = await load();
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_API_PREFIX = "/backend";
    expect(getEnv().serverHttpUri).toBe("http://localhost:8282/backend");
    expect(getEnv().apiPrefix).toBe("/backend");
  });

  test("resetEnvCache drops a snapshot taken before the prefix was known", async () => {
    const { getEnv, resetEnvCache } = await load();
    expect(getEnv().apiPrefix).toBe("/api");
    process.env.AKAN_API_PREFIX = "/backend";
    expect(getEnv().apiPrefix).toBe("/api");
    resetEnvCache();
    expect(getEnv().apiPrefix).toBe("/backend");
  });
});

afterAll(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, preservedEnv);
});

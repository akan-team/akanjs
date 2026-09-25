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
  "SERVER_HTTP_PROTOCOL",
  "SSH_TUNNEL_USERNAME",
  "SSH_TUNNEL_PASSWORD",
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

    expect(() => getEnv()).toThrow("environment variable AKAN_PUBLIC_APP_NAME is required");
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
      tunnelUsername: "root",
      tunnelPassword: "akan",
      side: "server",
      renderMode: "csr",
      websocket: true,
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

  test("honors explicit host, port, protocol, network, and tunnel overrides", async () => {
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
    expect(env.tunnelUsername).toBe("admin");
    expect(env.tunnelPassword).toBe("secret");
    expect(env.clientHost).toBe("client.example.com");
    expect(env.clientPort).toBe(3000);
    expect(env.clientHttpUri).toBe("https://client.example.com:3000");
    expect(env.serverHost).toBe("api.example.com");
    expect(env.serverPort).toBe(9443);
    expect(env.serverHttpUri).toBe("https://api.example.com:9443/api");
    expect(env.serverWsUri).toBe("wss://api.example.com:9443");
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

afterAll(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, preservedEnv);
});

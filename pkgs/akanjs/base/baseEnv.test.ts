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
  "AKAN_PUBLIC_SERVER_URL",
] as const;

// `getEnv` reads `window.location` on the client side; a URL object carries the same fields.
const asPage = async <T>(href: string, run: () => Promise<T>): Promise<T> => {
  const holder = globalThis as unknown as { window?: { location: URL } };
  holder.window = { location: new URL(href) };
  try {
    return await run();
  } finally {
    delete holder.window;
  }
};

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

  test("a cloud CSR bundle in a native shell calls its cloud host on 443, whatever the page origin", async () => {
    for (const href of ["app://localhost/", "https://app.localhost/"]) {
      resetEnv();
      process.env.AKAN_PUBLIC_ENV = "main";
      const env = await asPage(href, async () => (await loadBaseEnv()).getEnv());

      expect(env.serverHttpUri).toBe("https://minimal-main.example.com/api");
      expect(env.serverWsUri).toBe("wss://minimal-main.example.com");
    }
  });

  test("AKAN_PUBLIC_SERVER_URL names a CSR bundle's server, websocket included", async () => {
    resetEnv();
    Object.assign(process.env, { AKAN_PUBLIC_ENV: "local", AKAN_PUBLIC_SERVER_URL: "http://localhost:8282" });
    const local = await asPage("app://localhost/en?csr=true", async () => (await loadBaseEnv()).getEnv());
    expect(local.serverHttpUri).toBe("http://localhost:8282/api");
    expect(local.serverWsUri).toBe("ws://localhost:8282");

    resetEnv();
    Object.assign(process.env, { AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_SERVER_URL: "https://api.example.com" });
    const cloud = await asPage("https://app.localhost/", async () => (await loadBaseEnv()).getEnv());
    expect(cloud.serverHttpUri).toBe("https://api.example.com/api");
    expect(cloud.serverWsUri).toBe("wss://api.example.com");
  });

  test("an SSR tab ignores AKAN_PUBLIC_SERVER_URL and calls the origin that rendered it", async () => {
    resetEnv();
    Object.assign(process.env, {
      AKAN_PUBLIC_ENV: "main",
      AKAN_PUBLIC_RENDER_ENV: "ssr",
      AKAN_PUBLIC_SERVER_URL: "https://api.example.com",
    });
    const env = await asPage("https://minimal.example.com/en", async () => (await loadBaseEnv()).getEnv());
    expect(env.serverHttpUri).toBe("https://minimal.example.com/api");
  });

  test("a desktop app's launch env names the server it carries, ahead of the built-in URL and the dev gateway", async () => {
    const holder = globalThis as {
      __AKAN_NATIVE__?: { platform: string; env: Record<string, string> };
      __AKAN_NATIVE_DEV__?: { gateway: string };
    };
    try {
      for (const environment of ["local", "main"]) {
        resetEnv();
        Object.assign(process.env, { AKAN_PUBLIC_ENV: environment, AKAN_PUBLIC_SERVER_URL: "https://api.example.com" });
        holder.__AKAN_NATIVE__ = { platform: "macos", env: { PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:52345" } };
        holder.__AKAN_NATIVE_DEV__ = { gateway: "http://localhost:52011" };
        const env = await asPage("app://localhost/en", async () => (await loadBaseEnv()).getEnv());
        expect([environment, env.serverHttpUri, env.serverWsUri]).toEqual([
          environment,
          "http://127.0.0.1:52345/api",
          "ws://127.0.0.1:52345",
        ]);
      }

      resetEnv();
      process.env.AKAN_PUBLIC_ENV = "main";
      holder.__AKAN_NATIVE__ = { platform: "macos", env: { PUBLIC_AKAN_SERVER_URL: "app://localhost" } };
      delete holder.__AKAN_NATIVE_DEV__;
      await asPage("app://localhost/", async () => {
        const { getEnv } = await loadBaseEnv();
        expect(() => getEnv()).toThrow("PUBLIC_AKAN_SERVER_URL must be an http(s) URL");
      });
    } finally {
      delete holder.__AKAN_NATIVE__;
      delete holder.__AKAN_NATIVE_DEV__;
      delete process.env.AKAN_PUBLIC_SERVER_URL;
    }
  });

  test("AKAN_PUBLIC_SERVER_URL must be an http(s) URL", async () => {
    resetEnv();
    Object.assign(process.env, { AKAN_PUBLIC_ENV: "local", AKAN_PUBLIC_SERVER_URL: "app://localhost" });
    await asPage("app://localhost/", async () => {
      const { getEnv } = await loadBaseEnv();
      expect(() => getEnv()).toThrow("AKAN_PUBLIC_SERVER_URL must be an http(s) URL");
    });
  });

  test("a page the dev gateway served calls its own origin, which the shell and the gateway carry", async () => {
    const holder = globalThis as { __AKAN_NATIVE__?: { platform: string }; __AKAN_NATIVE_DEV__?: { gateway: string } };
    try {
      for (const [platform, href, http, ws] of [
        ["ios", "app://localhost/en?csr=true", "app://localhost/api", "app://localhost"],
        ["android", "https://app.localhost/en?csr=true", "https://app.localhost/api", "wss://app.localhost"],
      ] as const) {
        for (const environment of ["local", "develop"]) {
          resetEnv();
          Object.assign(process.env, { AKAN_PUBLIC_ENV: environment, AKAN_PUBLIC_SERVER_PORT: "8283" });
          holder.__AKAN_NATIVE__ = { platform };
          holder.__AKAN_NATIVE_DEV__ = { gateway: "http://localhost:52011" };
          const env = await asPage(href, async () => (await loadBaseEnv()).getEnv());
          expect([platform, environment, env.serverHttpUri, env.serverWsUri]).toEqual([
            platform,
            environment,
            http,
            ws,
          ]);
        }
      }

      resetEnv();
      Object.assign(process.env, { AKAN_PUBLIC_ENV: "local", AKAN_PUBLIC_SERVER_URL: "https://api.example.com" });
      const pinned = await asPage("app://localhost/", async () => (await loadBaseEnv()).getEnv());
      expect(pinned.serverHttpUri).toBe("https://api.example.com/api");
    } finally {
      delete holder.__AKAN_NATIVE__;
      delete holder.__AKAN_NATIVE_DEV__;
      delete process.env.AKAN_PUBLIC_SERVER_URL;
    }
  });

  test("a local release bundle in a native shell calls the dev server on localhost", async () => {
    const holder = globalThis as { __AKAN_NATIVE__?: { platform: string } };
    try {
      for (const [platform, href] of [
        ["ios", "app://localhost/en?csr=true"],
        ["android", "https://app.localhost/en?csr=true"],
      ] as const) {
        resetEnv();
        Object.assign(process.env, { AKAN_PUBLIC_ENV: "local", AKAN_PUBLIC_SERVER_PORT: "8283" });
        holder.__AKAN_NATIVE__ = { platform };
        const env = await asPage(href, async () => (await loadBaseEnv()).getEnv());
        expect(env.serverHttpUri).toBe("http://localhost:8283/api");
        expect(env.serverWsUri).toBe("ws://localhost:8283");
      }

      resetEnv();
      process.env.AKAN_PUBLIC_ENV = "main";
      holder.__AKAN_NATIVE__ = { platform: "ios" };
      const cloud = await asPage("app://localhost/", async () => (await loadBaseEnv()).getEnv());
      expect(cloud.serverHttpUri).toBe("https://minimal-main.example.com/api");
    } finally {
      delete holder.__AKAN_NATIVE__;
    }
  });

  test("getServerOrigin names what a browser outside the page opens: the dev server behind a gateway page", async () => {
    const holder = globalThis as { __AKAN_NATIVE__?: { platform: string }; __AKAN_NATIVE_DEV__?: { gateway: string } };
    const originOf = async (href: string) => asPage(href, async () => (await loadBaseEnv()).getServerOrigin());
    try {
      for (const [platform, href] of [
        ["ios", "app://localhost/en?csr=true"],
        ["android", "https://app.localhost/en?csr=true"],
        ["macos", "app://localhost/en?csr=true"],
      ] as const) {
        for (const environment of ["local", "develop"]) {
          resetEnv();
          Object.assign(process.env, { AKAN_PUBLIC_ENV: environment, AKAN_PUBLIC_SERVER_PORT: "8283" });
          holder.__AKAN_NATIVE__ = { platform };
          holder.__AKAN_NATIVE_DEV__ = { gateway: "http://localhost:52011" };
          expect([platform, environment, await originOf(href)]).toEqual([
            platform,
            environment,
            "http://localhost:8283",
          ]);
        }
      }
      delete holder.__AKAN_NATIVE_DEV__;

      resetEnv();
      Object.assign(process.env, { AKAN_PUBLIC_ENV: "local", AKAN_PUBLIC_SERVER_PORT: "8283" });
      holder.__AKAN_NATIVE__ = { platform: "android" };
      expect(await originOf("https://app.localhost/en?csr=true")).toBe("http://localhost:8283");

      resetEnv();
      process.env.AKAN_PUBLIC_ENV = "main";
      holder.__AKAN_NATIVE__ = { platform: "ios" };
      expect(await originOf("app://localhost/")).toBe("https://minimal-main.example.com");

      resetEnv();
      Object.assign(process.env, { AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_SERVER_URL: "https://api.example.com/" });
      expect(await originOf("app://localhost/")).toBe("https://api.example.com");
      delete process.env.AKAN_PUBLIC_SERVER_URL;

      resetEnv();
      Object.assign(process.env, { AKAN_PUBLIC_ENV: "debug", AKAN_PUBLIC_SERVER_PORT: "8283" });
      Object.assign(holder, {
        __AKAN_NATIVE__: { platform: "macos", env: { PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:51234" } },
        __AKAN_NATIVE_DEV__: { gateway: "http://localhost:52011" },
      });
      expect(await originOf("app://localhost/en?csr=true")).toBe("http://127.0.0.1:51234");
      delete holder.__AKAN_NATIVE__;
      delete holder.__AKAN_NATIVE_DEV__;

      resetEnv();
      Object.assign(process.env, { AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_RENDER_ENV: "ssr" });
      expect(await originOf("https://minimal.example.com/en")).toBe("https://minimal.example.com");

      resetEnv();
      process.env.AKAN_PUBLIC_ENV = "local";
      expect(await originOf("http://localhost:8282/en?csr=true")).toBe("http://localhost:8282");
    } finally {
      delete holder.__AKAN_NATIVE__;
      delete holder.__AKAN_NATIVE_DEV__;
      delete process.env.AKAN_PUBLIC_SERVER_URL;
    }
  });

  test("a local CSR bundle on an http page keeps following the page", async () => {
    resetEnv();
    process.env.AKAN_PUBLIC_ENV = "local";
    const env = await asPage("http://localhost:8282/en?csr=true", async () => (await loadBaseEnv()).getEnv());
    expect(env.serverHttpUri).toBe("http://localhost:8282/api");
    expect(env.serverWsUri).toBe("ws://localhost:8282");
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

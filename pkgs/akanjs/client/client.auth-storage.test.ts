import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

type Side = "server" | "client";
type RenderMode = "ssr" | "csr";

const envState = {
  side: "client" as Side,
  renderMode: "ssr" as RenderMode,
  appName: "test-app",
  environment: "debug",
};
const preferenceStore = new Map<string, string>();
const localStore = new Map<string, string>();
const cookieStore: Record<string, string> = {};
const fetchJwtCalls: Array<string | null> = [];
const requestState = {
  request: undefined as Request | undefined,
};

const makeJwt = (payload: Record<string, unknown>) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encoded}.signature`;
};

beforeAll(() => {
  mock.module("akanjs/base", () => ({
    getEnv: () => ({
      side: envState.side,
      renderMode: envState.renderMode,
      appName: envState.appName,
      environment: envState.environment,
    }),
  }));
  mock.module("akanjs/common", () => ({
    Logger: { log: () => undefined, verbose: () => undefined, error: () => undefined },
    decodeJwtPayload: (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")),
    parseAkanI18nEnv: () => ({ locales: ["en", "ko"], defaultLocale: "en" }),
    parseBasePaths: (value?: string) => (value ? value.split(",").filter(Boolean) : []),
    getBasePathFromPathname: () => null,
    pathGet: (path: string, obj: Record<string, unknown>, separator = ".", fallback?: unknown) =>
      path.split(separator).reduce<unknown>((acc, key) => {
        if (!acc || typeof acc !== "object") return fallback;
        return (acc as Record<string, unknown>)[key] ?? fallback;
      }, obj),
  }));
  mock.module("akanjs/fetch", () => ({
    defaultAccount: { appName: envState.appName, environment: envState.environment },
    requestStorage: {
      getStore: () => requestState.request,
    },
  }));
  mock.module("./useClient", () => ({
    msg: {
      loading: () => undefined,
      success: () => undefined,
      error: () => undefined,
    },
    fetch: {
      setJwt: (jwt: string | null) => fetchJwtCalls.push(jwt),
    },
  }));
});

const installCapacitorBridge = () => {
  Object.defineProperty(globalThis, "Capacitor", {
    value: {
      Plugins: {
        Preferences: {
          get: async ({ key }: { key: string }) => ({ value: preferenceStore.get(key) ?? null }),
          set: async ({ key, value }: { key: string; value: string }) => {
            preferenceStore.set(key, value);
          },
          remove: async ({ key }: { key: string }) => {
            preferenceStore.delete(key);
          },
        },
        CapacitorCookies: {
          setCookie: async ({ key, value }: { key: string; value: string }) => {
            cookieStore[key] = value;
          },
        },
      },
    },
    configurable: true,
  });
};

const installBrowserGlobals = (cookie = "") => {
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => localStore.get(key) ?? null,
      setItem: (key: string, value: string) => localStore.set(key, value),
      removeItem: (key: string) => localStore.delete(key),
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: {
      cookie,
    },
    configurable: true,
  });
};

afterEach(() => {
  envState.side = "client";
  envState.renderMode = "ssr";
  envState.appName = "test-app";
  envState.environment = "debug";
  preferenceStore.clear();
  localStore.clear();
  Object.keys(cookieStore).forEach((key) => {
    delete cookieStore[key];
  });
  fetchJwtCalls.length = 0;
  requestState.request = undefined;
  globalThis.__AKAN_CAPACITOR_IMPORTS__ = undefined;
  Object.defineProperty(globalThis, "localStorage", { value: undefined, configurable: true });
  Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });
  Object.defineProperty(globalThis, "Capacitor", { value: undefined, configurable: true });
});

describe("storage", () => {
  test("server mode is a no-op", async () => {
    envState.side = "server";
    const { storage } = await import("./storage");

    expect(await storage.getItem("jwt")).toBeUndefined();
    expect(await storage.setItem("jwt", "token")).toBeUndefined();
    expect(await storage.removeItem("jwt")).toBeUndefined();
  });

  test("client ssr mode uses localStorage", async () => {
    envState.side = "client";
    envState.renderMode = "ssr";
    installBrowserGlobals();
    const { storage } = await import("./storage");

    await storage.setItem("jwt", "token-1");
    expect(await storage.getItem("jwt")).toBe("token-1");
    await storage.removeItem("jwt");
    expect(await storage.getItem("jwt")).toBeNull();
  });

  test("client csr mode uses Capacitor Preferences", async () => {
    envState.side = "client";
    envState.renderMode = "csr";
    installCapacitorBridge();
    const { storage } = await import("./storage");

    await storage.setItem("jwt", "token-2");
    expect(await storage.getItem("jwt")).toBe("token-2");
    await storage.removeItem("jwt");
    expect(await storage.getItem("jwt")).toBeNull();
  });
});

describe("cookies, headers, and auth", () => {
  test("server cookies and headers read request storage", async () => {
    envState.side = "server";
    requestState.request = new Request("https://example.test", {
      headers: {
        cookie: 'jwt=abc; prefs=j:"dark"',
        "x-locale": "ko",
      },
    });
    const { cookies, getCookie, getHeader, headers, removeCookie } = await import("./cookie");

    expect(cookies().get("jwt")).toEqual({ name: "jwt", value: "abc" });
    expect(cookies().get("prefs")).toEqual({ name: "prefs", value: "dark" });
    expect(getCookie("jwt")).toBe("abc");
    expect(headers().get("x-locale")).toBe("ko");
    expect(getHeader("x-locale")).toBe("ko");
    expect(removeCookie("jwt")).toBe(true);
  });

  test("client cookies and account helpers use document/js-cookie and auth side effects", async () => {
    envState.side = "client";
    envState.renderMode = "ssr";
    const jwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
    installBrowserGlobals(`jwt=${jwt}; theme=dark`);
    const { cookies, getAccount, getCookie, initAuth, resetAuth, setAuth } = await import("./cookie");

    expect(cookies()).toBeInstanceOf(Map);
    expect(getCookie("jwt")).toBe(jwt);
    expect(getAccount<{ userId?: string }>().userId).toBe("u1");
    setAuth({ jwt: "new-token" });
    expect(fetchJwtCalls.at(-1)).toBe("new-token");
    expect(localStore.get("jwt")).toBe("new-token");

    initAuth({ jwt: "init-token" });
    expect(fetchJwtCalls.at(-1)).toBe("init-token");

    resetAuth();
    expect(fetchJwtCalls.at(-1)).toBeNull();
    expect(localStore.has("jwt")).toBe(false);
  });

  test("getAccount rejects mismatched app or environment jwt", async () => {
    envState.side = "client";
    installBrowserGlobals();
    const { getAccount } = await import("./cookie");

    Object.defineProperty(globalThis, "document", {
      value: { cookie: `jwt=${makeJwt({ appName: "other", environment: "debug" })}` },
      configurable: true,
    });
    expect(getAccount<Record<string, unknown>>()).toEqual({ appName: "test-app", environment: "debug" });
  });
});

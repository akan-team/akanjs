import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import { interpolateTranslation } from "../common/interpolateTranslation";
import { pathGetLoose } from "../common/objectPath";
import { parseCookieHeader } from "../fetch/requestStorage";

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
const documentCookies = new Map<string, string>();
const fetchJwtCalls: Array<string | null> = [];
const fetchState = { jwt: null as string | null };
const requestState = {
  request: undefined as Request | undefined,
};

const makeJwt = (payload: Record<string, unknown>) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encoded}.signature`;
};

// Re-implemented, not imported: the real helpers read `getEnv()`, and a static import binds it before the mock.
const legacyAuthTokenKey = "jwt";
const authTokenKey = () => `${legacyAuthTokenKey}:${envState.appName}`;
const isOwnAuthToken = (jwt: string) => {
  try {
    const account = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      appName?: string;
      environment?: string;
    };
    return account.appName === envState.appName && account.environment === envState.environment;
  } catch {
    return false;
  }
};

// The real parser: `client/cookie.ts` reads through it on both sides, so a copy could pass while the two disagree.
const requestCookies = () => parseCookieHeader(requestState.request?.headers.get("cookie") ?? "");

const requestHeaders = () => {
  const map = new Map<string, string>();
  requestState.request?.headers.forEach((value, key) => {
    map.set(key, value);
  });
  return map;
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
    Logger: { log: () => undefined, verbose: () => undefined, warn: () => undefined, error: () => undefined },
    decodeJwtPayload: (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")),
    legacyAuthTokenKey,
    authTokenKey: () => `${legacyAuthTokenKey}:${envState.appName}`,
    isOwnAuthToken,
    readAuthToken: (read: (key: string) => string | null | undefined) => {
      const scoped = read(`${legacyAuthTokenKey}:${envState.appName}`);
      if (scoped) return scoped;
      const legacy = read(legacyAuthTokenKey);
      return legacy && isOwnAuthToken(legacy) ? legacy : undefined;
    },
    parseAkanI18nEnv: () => ({ locales: ["en", "ko"], defaultLocale: "en" }),
    parseBasePaths: (value?: string) => (value ? value.split(",").filter(Boolean) : []),
    getBasePathFromPathname: () => null,
    pathGet: (path: string, obj: Record<string, unknown>, separator = ".", fallback?: unknown) =>
      path.split(separator).reduce<unknown>((acc, key) => {
        if (!acc || typeof acc !== "object") return fallback;
        return (acc as Record<string, unknown>)[key] ?? fallback;
      }, obj),
    interpolateTranslation,
    pathGetLoose,
  }));
  mock.module("akanjs/fetch", () => ({
    defaultAccount: { appName: envState.appName, environment: envState.environment },
    requestStorage: {
      getStore: () => requestState.request,
    },
    cookies: requestCookies,
    headers: requestHeaders,
    parseCookieHeader,
  }));
  mock.module("./useClient", () => ({
    msg: {
      loading: () => undefined,
      success: () => undefined,
      error: () => undefined,
    },
    fetch: {
      setJwt: (jwt: string | null) => {
        fetchJwtCalls.push(jwt);
        fetchState.jwt = jwt;
      },
      instance: {
        get jwt() {
          return fetchState.jwt;
        },
      },
    },
  }));
});

// A module of its own per test: the reinstall check runs once per module, as it does once per launch.
const freshStorage = (tag: string) => import(`./storage.ts?${tag}`) as Promise<typeof import("./storage")>;
let host: MockHost | null = null;
const secureStore = new Map<string, string>();
const secureClears: number[] = [];

const installNativeHost = () => {
  host = installMockHost({
    platform: "ios",
    plugins: {
      preferences: {
        methods: {
          get: ({ key }: { key: string }) => ({ value: preferenceStore.get(key) ?? null }),
          set: ({ key, value }: { key: string; value: string }) => void preferenceStore.set(key, value),
          remove: ({ key }: { key: string }) => void preferenceStore.delete(key),
        },
      },
      "secure-storage": {
        methods: {
          get: ({ key }: { key: string }) => ({ value: secureStore.get(key) ?? null }),
          set: ({ key, value }: { key: string; value: string }) => void secureStore.set(key, value),
          remove: ({ key }: { key: string }) => void secureStore.delete(key),
          clear: () => {
            secureClears.push(secureStore.size);
            secureStore.clear();
          },
        },
      },
    },
  });
};

const readCookieHeader = (header: string) => {
  const entries = new Map<string, string>();
  for (const segment of header.split(";")) {
    const trimmed = segment.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    entries.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return entries;
};

const installBrowserGlobals = (cookie = "") => {
  documentCookies.clear();
  for (const [name, value] of readCookieHeader(cookie)) documentCookies.set(name, value);
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => localStore.get(key) ?? null,
      setItem: (key: string, value: string) => localStore.set(key, value),
      removeItem: (key: string) => localStore.delete(key),
    },
    configurable: true,
  });
  // A real jar merges writes by name and drops expired ones; a plain field would hide the legacy-key delete.
  Object.defineProperty(globalThis, "document", {
    value: {
      get cookie() {
        return [...documentCookies].map(([name, value]) => `${name}=${value}`).join("; ");
      },
      set cookie(entry: string) {
        const [pair = "", ...attrs] = entry.split(";").map((part) => part.trim());
        const eq = pair.indexOf("=");
        if (eq === -1) return;
        const name = pair.slice(0, eq).trim();
        const expires = attrs.find((attr) => attr.toLowerCase().startsWith("expires="))?.slice("expires=".length);
        if (expires && Date.parse(expires) <= Date.now()) documentCookies.delete(name);
        else documentCookies.set(name, pair.slice(eq + 1).trim());
      },
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
  documentCookies.clear();
  fetchJwtCalls.length = 0;
  fetchState.jwt = null;
  requestState.request = undefined;
  host?.uninstall();
  host = null;
  secureStore.clear();
  secureClears.length = 0;
  Object.defineProperty(globalThis, "localStorage", { value: undefined, configurable: true });
  Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });
  Object.defineProperty(globalThis, "location", { value: undefined, configurable: true });
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

  test("client csr mode outside a native app uses localStorage", async () => {
    envState.side = "client";
    envState.renderMode = "csr";
    installBrowserGlobals();
    const { secretStorage, storage } = await import("./storage");

    await storage.setItem("theme", "dark");
    await secretStorage.setItem("jwt", "token-2");
    expect(localStore.get("theme")).toBe("dark");
    expect(localStore.get("jwt")).toBe("token-2");
    await secretStorage.removeItem("jwt");
    expect(await secretStorage.getItem("jwt")).toBeNull();
  });

  test("a native app keeps values in preferences and secrets in the credential store", async () => {
    envState.side = "client";
    envState.renderMode = "csr";
    installBrowserGlobals();
    installNativeHost();
    const { secretStorage, storage } = await freshStorage("native");

    await storage.setItem("theme", "dark");
    await secretStorage.setItem("jwt", "token-3");
    expect(preferenceStore.get("theme")).toBe("dark");
    expect(secureStore.get("jwt")).toBe("token-3");
    expect(localStore.size).toBe(0);
    expect(await secretStorage.getItem("jwt")).toBe("token-3");
    await secretStorage.removeItem("jwt");
    expect(await secretStorage.getItem("jwt")).toBeNull();
    await storage.removeItem("theme");
    expect(await storage.getItem("theme")).toBeNull();
  });

  test("a reinstall finds the credential store cleared once, before its first read", async () => {
    envState.side = "client";
    envState.renderMode = "csr";
    installBrowserGlobals();
    installNativeHost();
    secureStore.set("jwt:test-app", "left-by-the-last-install");
    const { secretStorage } = await freshStorage("reinstall");

    expect(await secretStorage.getItem("jwt:test-app")).toBeNull();
    await secretStorage.setItem("jwt:test-app", "token-4");
    expect(await secretStorage.getItem("jwt:test-app")).toBe("token-4");
    expect(secureClears).toEqual([1]);
    expect(preferenceStore.get("akan:installed")).toBe("1");

    const relaunched = await freshStorage("relaunch");
    expect(await relaunched.secretStorage.getItem("jwt:test-app")).toBe("token-4");
    expect(secureClears).toEqual([1]);
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
    expect(removeCookie("jwt")).toBeUndefined();
    expect(cookies().get("jwt")).toEqual({ name: "jwt", value: "abc" });
  });

  test("client cookies and account helpers use document/js-cookie and auth side effects", async () => {
    envState.side = "client";
    envState.renderMode = "ssr";
    const jwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
    const nextJwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u2" });
    installBrowserGlobals(`${authTokenKey()}=${jwt}; theme=dark`);
    const { cookies, getAccount, getAuthToken, getCookie, initAuth, resetAuth, setAuth } = await import("./cookie");

    expect(cookies()).toBeInstanceOf(Map);
    expect(getCookie(authTokenKey())).toBe(jwt);
    expect(getAuthToken()).toBe(jwt);
    expect(getAccount<{ userId?: string }>().userId).toBe("u1");
    setAuth({ jwt: nextJwt });
    expect(fetchJwtCalls.at(-1)).toBe(nextJwt);
    expect(localStore.get(authTokenKey())).toBe(nextJwt);
    expect(localStore.has("jwt")).toBe(false);

    initAuth({ jwt });
    expect(fetchJwtCalls.at(-1)).toBe(jwt);

    resetAuth();
    expect(fetchJwtCalls.at(-1)).toBeNull();
    expect(localStore.has(authTokenKey())).toBe(false);
  });

  test("the cookie key is scoped to the app, so a neighbour on the same host cannot be clobbered", async () => {
    envState.side = "client";
    envState.renderMode = "ssr";
    const jwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
    installBrowserGlobals();
    const { setAuth } = await import("./cookie");

    setAuth({ jwt });

    // Cookies carry no port, so `document.cookie` here is the same jar every localhost app writes into.
    expect(document.cookie).toContain(`jwt:test-app=${jwt}`);
    expect(document.cookie.startsWith("jwt=")).toBe(false);
  });

  test("a pre-scoping cookie is still read, but only when the token names this app", async () => {
    envState.side = "client";
    const own = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
    installBrowserGlobals(`jwt=${own}`);
    const { getAccount, getAuthToken } = await import("./cookie");

    expect(getAuthToken()).toBe(own);
    expect(getAccount<{ userId?: string }>().userId).toBe("u1");

    const neighbour = makeJwt({ appName: "other-app", environment: "debug", userId: "u9" });
    installBrowserGlobals(`jwt=${neighbour}`);
    expect(getAuthToken()).toBeUndefined();
  });

  test("initAuth ignores a token minted for another app instead of handing it to fetch", async () => {
    envState.side = "client";
    installBrowserGlobals();
    const { initAuth } = await import("./cookie");

    initAuth({ jwt: makeJwt({ appName: "other-app", environment: "debug", userId: "u9" }) });

    expect(fetchJwtCalls).toHaveLength(0);
    expect(document.cookie).toBe("");
  });

  test("initAuth clears a stale scoped cookie left by another environment", async () => {
    envState.side = "client";
    const stale = makeJwt({ appName: "test-app", environment: "main", userId: "u1" });
    installBrowserGlobals(`jwt:test-app=${stale}`);
    localStore.set("jwt:test-app", stale);
    const { initAuth } = await import("./cookie");

    initAuth();

    expect(fetchJwtCalls.at(-1)).toBeNull();
    expect(localStore.has("jwt:test-app")).toBe(false);
  });

  test("getAccount reads the Bearer header the server honours, not a bare jwt header", async () => {
    envState.side = "server";
    const jwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u9" });
    requestState.request = new Request("https://example.test", { headers: { authorization: `Bearer ${jwt}` } });
    const { getAccount } = await import("./cookie");
    expect(getAccount()).toMatchObject({ userId: "u9" });

    // No guard accepts a bare `jwt` header, so honouring it would claim a session the endpoint treats as anonymous.
    requestState.request = new Request("https://example.test", { headers: { jwt } });
    expect(getAccount() as unknown).toEqual({ appName: "test-app", environment: "debug" });
  });

  test("getAccount rejects mismatched app or environment jwt", async () => {
    envState.side = "client";
    installBrowserGlobals();
    const { getAccount } = await import("./cookie");

    installBrowserGlobals(`jwt=${makeJwt({ appName: "other", environment: "debug" })}`);
    expect(getAccount<Record<string, unknown>>()).toEqual({ appName: "test-app", environment: "debug" });
  });

  test("a CSR client is signed in by the token fetch sends, with no cookie anywhere", async () => {
    envState.side = "client";
    envState.renderMode = "csr";
    installBrowserGlobals();
    const { getAccount, getAuthToken, initAuth, resetAuth, setAuth } = await import("./cookie");
    const jwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });

    expect(getAuthToken()).toBeUndefined();
    setAuth({ jwt });
    expect(getAuthToken()).toBe(jwt);
    expect(getAccount<{ userId?: string }>().userId).toBe("u1");
    expect(document.cookie).toBe("");

    initAuth();
    expect(fetchJwtCalls.at(-1)).toBe(jwt);

    resetAuth();
    expect(getAuthToken()).toBeUndefined();
    expect(getAccount<Record<string, unknown>>()).toEqual({ appName: "test-app", environment: "debug" });
  });

  test("a custom-scheme page keeps its cookies in localStorage", async () => {
    envState.side = "client";
    envState.renderMode = "csr";
    installBrowserGlobals();
    Object.defineProperty(globalThis, "location", { value: { protocol: "app:" }, configurable: true });
    const { getCookie, removeCookie, setCookie } = await import("./cookie");

    setCookie("theme", "dark");
    setCookie("prepareUserId", "p1");
    expect(getCookie("theme")).toBe("dark");
    expect(JSON.parse(localStore.get("akan:cookies") ?? "{}")).toEqual({ theme: "dark", prepareUserId: "p1" });
    expect(document.cookie).toBe("");

    removeCookie("theme");
    expect(getCookie("theme")).toBeUndefined();
    expect(getCookie("prepareUserId")).toBe("p1");
  });

  test("any other page keeps using the browser's cookie jar", async () => {
    envState.side = "client";
    envState.renderMode = "csr";
    installBrowserGlobals();
    Object.defineProperty(globalThis, "location", { value: { protocol: "https:" }, configurable: true });
    const { getCookie, setCookie } = await import("./cookie");

    setCookie("theme", "dark");
    expect(document.cookie).toBe("theme=dark");
    expect(getCookie("theme")).toBe("dark");
    expect(localStore.has("akan:cookies")).toBe(false);
  });
});

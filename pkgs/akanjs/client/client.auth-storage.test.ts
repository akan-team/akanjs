import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import { legacyAuthTokenKey } from "../common/authCookie";
import { bearerTokenOf } from "../common/bearerTokenOf";
import { CookieJar } from "../common/cookieJar";
import { interpolateTranslation } from "../common/interpolateTranslation";
import { decodeJwtPayload } from "../common/jwtDecode";
import { pathGetLoose } from "../common/objectPath";

type Side = "server" | "client";
type RenderMode = "ssr" | "csr";

const envState = {
  side: "client" as Side,
  renderMode: "ssr" as RenderMode,
  appName: "test-app",
  environment: "debug",
  operationMode: "cloud" as "local" | "cloud",
};
const preferenceStore = new Map<string, string>();
const localStore = new Map<string, string>();
const documentCookies = new Map<string, string>();
const cookieWrites: string[] = [];
const fetchJwtCalls: Array<string | null> = [];
const duplicateReports: Array<{ names: string[]; host: string }> = [];
const fetchState = { jwt: null as string | null };
const requestState = {
  request: undefined as Request | undefined,
};

const makeJwt = (payload: Record<string, unknown>) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encoded}.signature`;
};

// Loaded once `akanjs/base` is mocked: the real helpers read `getEnv()`, and a static import binds it first.
let authToken: typeof import("../common/authToken");
let sessionCookies: typeof import("../common/sessionCookies");
const authTokenKey = () => authToken.authTokenKey();

// The real parser: `client/cookie.ts` reads through it on both sides, so a copy could pass while the two disagree.
const requestCookieJar = () => CookieJar.parse(requestState.request?.headers.get("cookie"));

const requestHeaders = () => {
  const map = new Map<string, string>();
  requestState.request?.headers.forEach((value, key) => {
    map.set(key, value);
  });
  return map;
};

beforeAll(async () => {
  mock.module("akanjs/base", () => ({
    getEnv: () => ({
      side: envState.side,
      renderMode: envState.renderMode,
      appName: envState.appName,
      environment: envState.environment,
      operationMode: envState.operationMode,
    }),
  }));
  authToken = await import("../common/authToken");
  sessionCookies = await import("../common/sessionCookies");
  mock.module("akanjs/common", () => ({
    Logger: { log: () => undefined, verbose: () => undefined, warn: () => undefined, error: () => undefined },
    bearerTokenOf,
    decodeJwtPayload,
    legacyAuthTokenKey,
    authTokenKey: authToken.authTokenKey,
    isOwnAuthToken: authToken.isOwnAuthToken,
    retiredAuthTokenKeys: authToken.retiredAuthTokenKeys,
    CookieJar,
    readSessionToken: authToken.readSessionToken,
    SessionCookies: {
      report: (duplicates: Array<{ name: string }>, host: string) =>
        void duplicateReports.push({ names: duplicates.map(({ name }) => name), host }),
      sweepOf: sessionCookies.SessionCookies.sweepOf,
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
    cookieJar: requestCookieJar,
    headers: requestHeaders,
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
        cookieWrites.push(entry);
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
  envState.operationMode = "cloud";
  preferenceStore.clear();
  localStore.clear();
  documentCookies.clear();
  cookieWrites.length = 0;
  fetchJwtCalls.length = 0;
  duplicateReports.length = 0;
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
    const { cookieJar, cookies, getCookie, getHeader, headers, removeCookie } = await import("./cookie");

    expect(cookies().get("jwt")).toEqual({ name: "jwt", value: "abc" });
    expect(cookies().get("prefs")).toEqual({ name: "prefs", value: 'j:"dark"' });
    expect(cookieJar().readJson("prefs")).toBe("dark");
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
    expect(localStore.get("jwt:test-app")).toBe(nextJwt);
    expect(localStore.has(authTokenKey())).toBe(false);
    expect(localStore.has("jwt")).toBe(false);

    initAuth({ jwt });
    expect(fetchJwtCalls.at(-1)).toBe(jwt);

    resetAuth();
    expect(fetchJwtCalls.at(-1)).toBeNull();
    expect(localStore.has("jwt:test-app")).toBe(false);
  });

  test("the cookie key is scoped to the app, so a neighbour on the same host cannot be clobbered", async () => {
    envState.side = "client";
    envState.renderMode = "ssr";
    const jwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
    installBrowserGlobals();
    const { setAuth } = await import("./cookie");

    setAuth({ jwt });

    // Cookies carry no port, so `document.cookie` here is the same jar every localhost app writes into.
    expect(document.cookie).toBe(`__Host-jwt:test-app=${jwt}`);
  });

  test("a local server writes the scoped name without `__Host-`, whose Secure plain http cannot keep", async () => {
    envState.side = "client";
    envState.operationMode = "local";
    const jwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
    installBrowserGlobals();
    const { getAuthToken, setAuth } = await import("./cookie");

    setAuth({ jwt });

    expect(document.cookie).toBe(`jwt:test-app=${jwt}`);
    expect(getAuthToken()).toBe(jwt);
  });

  test("a cookie under a retired name is never read, and initAuth, setAuth and resetAuth expire it", async () => {
    envState.side = "client";
    const own = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
    installBrowserGlobals(`jwt=${own}; jwt:test-app=${own}; theme=dark`);
    const { getAuthToken, initAuth, resetAuth, setAuth } = await import("./cookie");

    expect(getAuthToken()).toBeUndefined();
    initAuth();
    expect(fetchJwtCalls).toHaveLength(0);
    expect(document.cookie).toBe("theme=dark");

    for (const act of [() => setAuth({ jwt: own }), resetAuth]) {
      cookieWrites.length = 0;
      act();
      expect(cookieWrites.filter((entry) => entry.includes("expires=Thu, 01 Jan 1970"))).toEqual(
        expect.arrayContaining([expect.stringMatching(/^jwt=;/), expect.stringMatching(/^jwt:test-app=;/)]),
      );
    }
  });

  test("a pre-scoping cookie is never read, even when its token names this app", async () => {
    envState.side = "client";
    const own = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
    installBrowserGlobals(`jwt=${own}`);
    const { getAccount, getAuthToken, getStoredAuthToken, initAuth } = await import("./cookie");

    expect(getAuthToken()).toBeUndefined();
    expect(getAccount<Record<string, unknown>>()).toEqual({ appName: "test-app", environment: "debug" });
    initAuth();
    expect(fetchJwtCalls).toHaveLength(0);

    localStore.set("jwt", own);
    expect(await getStoredAuthToken()).toBeUndefined();
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
    installBrowserGlobals(`${authTokenKey()}=${stale}`);
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

  test("getAccount reads the Authorization header with the server's one bearer grammar", async () => {
    envState.side = "server";
    const jwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u9" });
    const { getAccount } = await import("./cookie");
    const accountWith = (authorization: string) => {
      requestState.request = new Request("https://example.test", { headers: { authorization } });
      return getAccount<{ userId?: string }>().userId;
    };

    expect(accountWith(`bearer   ${jwt}`)).toBe("u9");
    expect(accountWith(jwt)).toBeUndefined();
    expect(accountWith(`Bearer ${jwt} extra`)).toBeUndefined();
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

  test("a value reads back as written, in the browser's jar and in a custom-scheme page's", async () => {
    envState.side = "client";
    const values = ["a;b", "a,b", " padded ", '"quoted"', "back\\slash", "100%", "tab\tline\nfeed", "\u00a0nbsp"];
    for (const protocol of ["https:", "app:"]) {
      installBrowserGlobals();
      Object.defineProperty(globalThis, "location", { value: { protocol }, configurable: true });
      const { getCookie, setCookie } = await import("./cookie");
      for (const [idx, value] of values.entries()) setCookie(`v${idx}`, value);
      expect(values.map((_, idx) => getCookie(`v${idx}`))).toEqual(values);
    }
    expect(cookieWrites[0]).toBe("v0=a%3Bb; path=/; SameSite=lax; Secure");
  });

  test("a JWT, a plain word and a value its caller percent-encoded are written as given", async () => {
    envState.side = "client";
    const jwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
    const redirect = encodeURIComponent("/en/orders?tab=open");
    installBrowserGlobals();
    const { getCookie, setCookie } = await import("./cookie");

    setCookie("token", jwt);
    setCookie("theme", "dark");
    setCookie("signinRedirect", redirect);

    expect(cookieWrites.map((entry) => entry.split(";")[0])).toEqual([
      `token=${jwt}`,
      "theme=dark",
      `signinRedirect=${redirect}`,
    ]);
    expect(getCookie("signinRedirect")).toBe("/en/orders?tab=open");
    expect(CookieJar.parse(document.cookie).read("signinRedirect").value).toBe("/en/orders?tab=open");
  });

  test("a cookie is written Lax and Secure on the root path, the auth cookie included", async () => {
    envState.side = "client";
    envState.renderMode = "ssr";
    const jwt = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
    installBrowserGlobals();
    const { setAuth, setCookie } = await import("./cookie");

    setCookie("theme", "dark");
    setAuth({ jwt });

    expect(cookieWrites[0]).toBe("theme=dark; path=/; SameSite=lax; Secure");
    expect(cookieWrites).toContain(`${authTokenKey()}=${jwt}; path=/; SameSite=lax; Secure`);
  });

  test("partial options are merged over the defaults instead of replacing them", async () => {
    envState.side = "client";
    installBrowserGlobals();
    const { setCookie } = await import("./cookie");

    setCookie("theme", "dark", { path: "/docs" });
    setCookie("theme", "dark", { secure: false });
    setCookie("theme", "dark", { sameSite: "none" });

    expect(cookieWrites).toEqual([
      "theme=dark; path=/docs; SameSite=lax; Secure",
      "theme=dark; path=/; SameSite=lax",
      "theme=dark; path=/; SameSite=none; Secure",
    ]);
  });

  test("removing a `__Host-` or `__Secure-` cookie writes the Secure its name demands", async () => {
    envState.side = "client";
    installBrowserGlobals("__Host-signupToken=t; __Secure-pref=p; theme=dark");
    const { removeCookie } = await import("./cookie");

    removeCookie("__Host-signupToken");
    removeCookie("__Secure-pref");
    removeCookie("theme");

    expect(cookieWrites).toEqual([
      "__Host-signupToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; Secure;",
      "__Secure-pref=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; Secure;",
      "theme=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;",
    ]);
    expect(document.cookie).toBe("");
  });
});

interface JarCookie {
  name: string;
  value: string;
  domain?: string;
  path: string;
  partitioned?: boolean;
}

// A jar keyed the way a browser keys one — name, domain, path and partition — so a sweep reaches only the copy it
// names; a host-only copy has no domain, so no `Domain=` deletion reaches it.
const installCookieJar = (href: string, jar: JarCookie[]) => {
  installBrowserGlobals();
  const url = new URL(href);
  Object.defineProperty(globalThis, "location", {
    value: {
      protocol: url.protocol,
      host: url.host,
      hostname: url.hostname,
      pathname: url.pathname,
      search: url.search,
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: {
      get cookie() {
        return jar.map(({ name, value }) => `${name}=${value}`).join("; ");
      },
      set cookie(entry: string) {
        cookieWrites.push(entry);
        const [pair = "", ...attrs] = entry.split(";").map((part) => part.trim());
        const attr = (key: string) =>
          attrs.find((part) => part.toLowerCase().startsWith(`${key}=`))?.slice(key.length + 1);
        const name = pair.slice(0, pair.indexOf("="));
        const domain = attr("domain");
        const path = attr("path") ?? "/";
        const partitioned = attrs.some((part) => part.toLowerCase() === "partitioned") || undefined;
        const idx = jar.findIndex(
          (cookie) =>
            cookie.name === name &&
            cookie.domain === domain &&
            cookie.path === path &&
            cookie.partitioned === partitioned,
        );
        if (idx !== -1) jar.splice(idx, 1);
        if (attr("max-age") !== "0")
          jar.push({ name, value: pair.slice(pair.indexOf("=") + 1), domain, path, partitioned });
      },
    },
    configurable: true,
  });
  return jar;
};

describe("duplicated session cookies", () => {
  const own = makeJwt({ appName: "test-app", environment: "debug", userId: "u1" });
  const planted = makeJwt({ appName: "test-app", environment: "debug", userId: "intruder" });
  // Only a name without `__Host-` can be planted from a parent domain or under a deeper path, as a local server's is.
  beforeEach(() => {
    envState.operationMode = "local";
  });

  test("the jar, server cookies() and client cookies() read a duplicated name as absent alike", async () => {
    const header = `jwt:test-app=${own}; theme=dark; jwt:test-app=${planted}`;
    const { cookies, getAuthToken, getCookie } = await import("./cookie");
    const reads = () => ({
      cookie: cookies().get("jwt:test-app"),
      getCookie: getCookie("jwt:test-app"),
      theme: getCookie("theme"),
      token: getAuthToken(),
    });
    const expected = { cookie: undefined, getCookie: undefined, theme: "dark", token: undefined };

    expect(CookieJar.parse(header).read("jwt:test-app")).toEqual({ count: 2 });
    envState.side = "server";
    requestState.request = new Request("https://app.example.com", { headers: { cookie: header } });
    expect(reads()).toEqual(expected);
    envState.side = "client";
    installBrowserGlobals();
    Object.defineProperty(globalThis, "document", { value: { cookie: header }, configurable: true });
    expect(reads()).toEqual(expected);
  });

  test("initAuth sweeps the parent-domain copy and adopts the survivor without writing it back", async () => {
    envState.side = "client";
    const jar = installCookieJar("https://app.example.com/en/orders", [
      { name: "jwt:test-app", value: planted, domain: "example.com", path: "/" },
      { name: "jwt:test-app", value: own, path: "/" },
    ]);
    const { initAuth } = await import("./cookie");

    initAuth();

    expect(duplicateReports).toEqual([{ names: ["jwt:test-app"], host: "app.example.com" }]);
    expect(jar).toEqual([{ name: "jwt:test-app", value: own, path: "/" }]);
    expect(
      cookieWrites.every((entry) => /; Domain=(app\.)?example\.com;/.test(entry) && entry.includes("Max-Age=0")),
    ).toBe(true);
    expect(cookieWrites.some((entry) => entry.includes(own))).toBe(false);
    expect(fetchJwtCalls).toEqual([own]);
    expect(localStore.has("jwt:test-app")).toBe(false);
  });

  test("initAuth sweeps a copy under the page's own host as a Domain, and a partitioned copy", async () => {
    envState.side = "client";
    const jar = installCookieJar("https://app.example.com/en/orders", [
      { name: "jwt:test-app", value: planted, domain: "app.example.com", path: "/en" },
      { name: "jwt:test-app", value: planted, domain: "example.com", path: "/", partitioned: true },
      { name: "jwt:test-app", value: own, path: "/" },
    ]);
    const { initAuth } = await import("./cookie");

    initAuth();

    expect(jar).toEqual([{ name: "jwt:test-app", value: own, path: "/" }]);
    expect(fetchJwtCalls).toEqual([own]);
  });

  test("initAuth signs the page out while copies outlive the sweep", async () => {
    envState.side = "client";
    const jar = installCookieJar("https://app.example.com/en/orders", [
      { name: "jwt:test-app", value: own, path: "/" },
      { name: "jwt:test-app", value: planted, path: "/en" },
    ]);
    const { getAuthToken, initAuth } = await import("./cookie");

    initAuth();

    expect(fetchJwtCalls).toEqual([null]);
    expect(jar).toHaveLength(2);
    expect(getAuthToken()).toBeUndefined();
  });

  test("initAuth adopts a lone session cookie without writing it back", async () => {
    envState.side = "client";
    installCookieJar("https://app.example.com/en", [{ name: "jwt:test-app", value: own, path: "/" }]);
    const { initAuth } = await import("./cookie");

    initAuth();

    expect(fetchJwtCalls).toEqual([own]);
    expect(cookieWrites).toEqual([]);
    expect(localStore.has("jwt:test-app")).toBe(false);
    expect(duplicateReports).toEqual([]);
  });

  test("initAuth sends no sweep for a duplicated `__Host-` cookie and signs the page out", async () => {
    envState.side = "client";
    envState.operationMode = "cloud";
    const jar = installCookieJar("https://app.example.com/en", [
      { name: "__Host-jwt:test-app", value: own, path: "/" },
      { name: "__Host-jwt:test-app", value: planted, path: "/", partitioned: true },
    ]);
    const { initAuth } = await import("./cookie");

    initAuth();

    expect(cookieWrites).toEqual([]);
    expect(jar).toHaveLength(2);
    expect(fetchJwtCalls).toEqual([null]);
  });

  test("initAuth takes no token from the address bar", async () => {
    envState.side = "client";
    installCookieJar(`https://app.example.com/en?jwt=${own}`, []);
    const { initAuth } = await import("./cookie");

    initAuth();

    expect(fetchJwtCalls).toEqual([]);
    expect(cookieWrites).toEqual([]);
  });
});

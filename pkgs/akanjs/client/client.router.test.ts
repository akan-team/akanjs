import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { interpolateTranslation } from "../common/interpolateTranslation";
import { pathGetLoose } from "../common/objectPath";
import type { RouterInstance } from "./router";

type Side = "server" | "client";

const envState = {
  side: "client" as Side,
  operationMode: "local",
  basePaths: "admin,console",
};
const requestState = {
  request: undefined as Request | undefined,
  headers: new Map<string, string>(),
};
const messages: unknown[] = [];
const warnings: string[] = [];
const timeoutCallbacks: Array<() => void> = [];

beforeAll(() => {
  mock.module("akanjs/base", () => ({
    getEnv: () => ({
      side: envState.side,
      renderMode: "csr",
      appName: "test-app",
      environment: "debug",
      operationMode: envState.operationMode,
    }),
  }));
  mock.module("akanjs/common", () => ({
    Logger: Object.assign(
      class Logger {
        log() {}
        verbose() {}
        info() {}
        warn() {}
        error() {}
      },
      {
        log: () => undefined,
        verbose: () => undefined,
        info: () => undefined,
        warn: (message: string) => {
          warnings.push(message);
        },
        error: () => undefined,
      },
    ),
    parseAkanI18nEnv: () => ({ locales: ["en", "ko"], defaultLocale: "en" }),
    parseBasePaths: (value?: string) => (value ? value.split(",").filter(Boolean) : []),
    pathGet: (path: string, obj: Record<string, unknown>, separator = ".", fallback?: unknown) =>
      path.split(separator).reduce<unknown>((acc, key) => {
        if (!acc || typeof acc !== "object") return fallback;
        return (acc as Record<string, unknown>)[key] ?? fallback;
      }, obj),
    interpolateTranslation,
    pathGetLoose,
    getBasePathFromPathname: (
      pathname: string,
      opts: { basePaths: Set<string>; i18n: { locales: string[] }; headerBasePath?: string },
    ) => {
      if (opts.headerBasePath) return opts.headerBasePath;
      const [, lang, base] = pathname.split("/");
      return opts.i18n.locales.includes(lang ?? "") && base && opts.basePaths.has(base) ? base : null;
    },
  }));
  mock.module("akanjs/fetch", () => ({
    FetchClient: {
      build: () => ({ fetch: { setJwt: () => undefined }, sig: {} }),
    },
    defaultAccount: { appName: "test-app", environment: "debug" },
    requestStorage: {
      getStore: () => requestState.request,
    },
    getRequest: () => requestState.request,
    headers: () => requestState.headers,
    untrackedRequest: () => requestState.request,
    untrackedHeaders: () => requestState.headers,
  }));
});

const installClientWindow = (pathname = "/en/admin/current", search = "", hash = "") => {
  const origin = "https://example.test";
  Object.defineProperty(globalThis, "window", {
    value: {
      location: { origin, host: "example.test", href: `${origin}${pathname}${search}${hash}`, pathname, search, hash },
      parent: { postMessage: (message: unknown) => messages.push(message) },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: { referrer: "https://example.test/en/admin/previous" },
    configurable: true,
  });
  Object.defineProperty(globalThis, "location", {
    value: { pathname, search, hash, href: `${origin}${pathname}${search}${hash}` },
    configurable: true,
  });
};

const recordingRouter = (calls: unknown[]): RouterInstance => ({
  push: (href, options) => {
    calls.push(["push", href, options]);
  },
  replace: (href, options) => {
    calls.push(["replace", href, options]);
  },
  back: (options) => calls.push(["back", options]),
  refresh: () => calls.push(["refresh"]),
});

const queueTimeouts = () => {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((handler: TimerHandler) => {
    timeoutCallbacks.push(() => {
      if (typeof handler === "function") handler();
    });
    return timeoutCallbacks.length as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
  return () => {
    globalThis.setTimeout = originalSetTimeout;
  };
};

const flushTimeouts = () => {
  for (const callback of timeoutCallbacks.splice(0)) callback();
};

afterEach(() => {
  envState.side = "client";
  envState.operationMode = "local";
  envState.basePaths = "admin,console";
  process.env.AKAN_PUBLIC_BASE_PATHS = envState.basePaths;
  requestState.request = undefined;
  requestState.headers = new Map();
  messages.length = 0;
  warnings.length = 0;
  timeoutCallbacks.length = 0;
  globalThis.__AKAN_ROUTER__ = undefined;
  Object.defineProperty(globalThis, "window", { value: undefined, configurable: true });
  Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });
  Object.defineProperty(globalThis, "location", { value: undefined, configurable: true });
});

describe("router", () => {
  test("normalizes paths with language, prefix, query, hash, root, and absolute hrefs", async () => {
    const { getPathInfo, normalizeDeepLinkHref } = await import("./router");

    expect(getPathInfo("/en/admin/users?tab=a#bio", "en", "admin")).toEqual({
      path: "/users",
      pathname: "/en/admin/users",
      search: "tab=a",
      hash: "bio",
      href: "/en/admin/users?tab=a#bio",
    });
    expect(getPathInfo("/en/admin", "en", "admin").path).toBe("/");
    expect(getPathInfo("/users", "ko", "").href).toBe("/ko/users");
    expect(getPathInfo("https://external.test/path", "en", "admin").pathname).toBe("https://external.test/path");
    expect(normalizeDeepLinkHref("minimal://orders/detail")).toBe("/orders/detail");
    expect(normalizeDeepLinkHref("minimal://wishlists/camera?deepLink=true#preview")).toBe(
      "/wishlists/camera?deepLink=true#preview",
    );
    expect(normalizeDeepLinkHref("https://localhost:8283/orders/detail")).toBe("/orders/detail");
    expect(normalizeDeepLinkHref("/en/orders/detail?tab=a", "app://localhost")).toBe("/en/orders/detail?tab=a");
  });

  test("resolves deep link stacks with route manifest and indexPath fallback", async () => {
    envState.side = "client";
    installClientWindow("/en/admin/explore");
    let historyState: unknown = null;
    const historyStub = {
      state: null as unknown,
      replaceState: (state: unknown) => {
        historyState = state;
        historyStub.state = state;
      },
    };
    Object.assign(window, { history: historyStub, addEventListener: () => undefined });
    const calls: unknown[] = [];
    const restoreTimeout = queueTimeouts();
    const { router } = await import("./router");

    router.init({
      type: "csr",
      lang: "en",
      prefix: "admin",
      routeManifest: [
        "/",
        "/:lang/explore",
        "/:lang/wishlists",
        "/:lang/wishlists/camera",
        "/:lang/orders/detail",
        "/:lang/profile",
        "/:lang/profile/self",
        "/:lang/profile/self/edit",
      ],
      indexPath: "/explore",
      router: recordingRouter(calls),
    });

    expect(historyState).toEqual({ __akanRouter: { idx: 0 } });
    expect(router.resolveDeepLinkStack("/wishlists/camera?deepLink=true#preview")).toEqual([
      "/wishlists",
      "/wishlists/camera?deepLink=true#preview",
    ]);
    expect(router.resolveDeepLinkStack("minimal://orders/detail")).toEqual(["/explore", "/orders/detail"]);
    expect(router.resolveDeepLinkStack("minimal://profile/self/edit")).toEqual([
      "/profile",
      "/profile/self",
      "/profile/self/edit",
    ]);
    expect(router.resolveDeepLinkStack("/missing")).toEqual([]);
    expect(router.resolveDeepLinkStack("https://example.test/ko/admin/orders/detail")).toEqual([
      "/explore",
      "/orders/detail",
    ]);
    expect(router.resolveDeepLinkStack("/en/wishlists/camera")).toEqual(["/wishlists", "/wishlists/camera"]);

    expect(router.enterDeepLink("minimal://profile/self/edit", { resetStack: true })).toBe(true);
    expect(calls).toEqual([]);
    timeoutCallbacks.shift()?.();
    expect(calls).toEqual([["replace", "/en/admin/profile", {}]]);
    timeoutCallbacks.shift()?.();
    expect(calls.at(-1)).toEqual(["push", "/en/admin/profile/self", {}]);
    timeoutCallbacks.shift()?.();
    expect(calls).toEqual([
      ["replace", "/en/admin/profile", {}],
      ["push", "/en/admin/profile/self", {}],
      ["push", "/en/admin/profile/self/edit", {}],
    ]);
    expect(router.canGoBack()).toBe(true);
    restoreTimeout();
  });

  test("client router init wraps push, replace, back, refresh, and path helpers", async () => {
    envState.side = "client";
    installClientWindow();
    const restoreTimeout = queueTimeouts();
    const calls: unknown[] = [];
    const { router } = await import("./router");

    router.init({
      type: "csr",
      lang: "en",
      prefix: "admin",
      router: recordingRouter(calls),
    });

    router.push("/users", { scrollToTop: true });
    router.replace("/settings");
    expect(calls).toEqual([["push", "/en/admin/users", { scrollToTop: true }]]);
    flushTimeouts();
    expect(calls).toEqual([
      ["push", "/en/admin/users", { scrollToTop: true }],
      ["replace", "/en/admin/settings", undefined],
    ]);
    router.back({ scrollToTop: false });
    router.refresh();
    expect(calls.at(-2)).toEqual(["back", { scrollToTop: false }]);
    expect(calls.at(-1)).toEqual(["refresh"]);
    expect(messages[0]).toMatchObject({ type: "pathChange", path: "/users", pathname: "/en/admin/users" });
    expect(router.getPath("/en/admin/current")).toBe("/current");
    expect(router.getFullPath()).toBe("/en/admin/current");
    expect(router.getPrefixedPath("/next")).toBe("/en/admin/next");

    router.setLang("ko");
    flushTimeouts();
    expect(calls.at(-1)).toEqual(["replace", "/ko/admin/current", undefined]);
    restoreTimeout();
  });

  test("navigation() carries a refused push back to the caller", async () => {
    envState.side = "client";
    installClientWindow();
    const { router } = await import("./router");
    const refusal = new Error("no route at /nope");
    refusal.name = "RscRouteNotFound";

    router.init({
      type: "ssr",
      side: "client",
      lang: "en",
      router: {
        push: (href) => (href.includes("/nope") ? Promise.reject(refusal) : undefined),
        replace: () => undefined,
        back: () => undefined,
        refresh: () => undefined,
      },
    });

    router.push("/docs/intro");
    await expect(router.navigation()).resolves.toBeUndefined();

    router.push("/nope");
    await expect(router.navigation()).rejects.toThrow("no route at /nope");
    // Awaited twice: the router holds the refusal, so an unawaited one is no unhandled rejection, yet it still rejects.
    await expect(router.navigation()).rejects.toThrow("no route at /nope");
  });

  test("csr navigation preserves csr runtime search params", async () => {
    envState.side = "client";
    installClientWindow("/en/admin/current", "?csr=true&akanMobileTarget=default&akanMobileBasePath=admin");
    const restoreTimeout = queueTimeouts();
    const calls: unknown[] = [];
    const { router } = await import("./router");

    router.init({
      type: "csr",
      lang: "en",
      prefix: "admin",
      router: recordingRouter(calls),
    });

    router.push("/users?tab=a#bio");
    router.replace("/settings?csr=false");
    flushTimeouts();

    expect(calls).toEqual([
      ["push", "/en/admin/users?tab=a&csr=true&akanMobileTarget=default&akanMobileBasePath=admin#bio", undefined],
      ["replace", "/en/admin/settings?csr=false&akanMobileTarget=default&akanMobileBasePath=admin", undefined],
    ]);
    restoreTimeout();
  });

  test("ssr client navigation hides base path outside local mode", async () => {
    envState.side = "client";
    envState.operationMode = "main";
    installClientWindow("/en/current");
    const calls: unknown[] = [];
    const { router } = await import("./router");

    router.init({
      type: "ssr",
      side: "client",
      lang: "en",
      prefix: "admin",
      router: recordingRouter(calls),
    });

    router.push("/", { scrollToTop: true });
    router.replace("/users?tab=a#bio");

    expect(calls).toEqual([
      ["push", "/en", { scrollToTop: true }],
      ["replace", "/en/users?tab=a#bio", undefined],
    ]);
    expect(messages[0]).toMatchObject({ type: "pathChange", path: "/", pathname: "/en/admin" });
  });

  test("ssr setLang preserves production public paths while switching locale", async () => {
    envState.side = "client";
    envState.operationMode = "main";
    installClientWindow("/ko/docs/intro/fundamentals", "?from=nav", "#section");
    const calls: unknown[] = [];
    const { router } = await import("./router");

    router.init({
      type: "ssr",
      side: "client",
      lang: "en",
      prefix: "akanjs",
      router: recordingRouter(calls),
    });

    router.setLang("ko");

    expect(calls).toEqual([["replace", "/ko/docs/intro/fundamentals?from=nav#section", undefined]]);
    expect(messages[0]).toMatchObject({
      type: "pathChange",
      path: "/docs/intro/fundamentals",
      pathname: "/ko/akanjs/docs/intro/fundamentals",
      hash: "section",
    });
  });

  test("throws initialized guard before init and server redirect/notFound errors", async () => {
    envState.side = "client";
    installClientWindow();
    const { AkanNotFoundError, AkanRedirectError, router } = await import("./router");

    envState.side = "server";
    process.env.AKAN_PUBLIC_BASE_PATHS = "admin,console";
    requestState.request = new Request("https://example.test/en/admin/current");
    requestState.headers = new Map([
      ["x-locale", "en"],
      ["x-base-path", "admin"],
    ]);
    expect(() => router.redirect("/users?tab=a")).toThrow(AkanRedirectError);
    try {
      router.redirect("/users?tab=a");
    } catch (error) {
      expect(error).toBeInstanceOf(AkanRedirectError);
      expect((error as Error & { location: string; method: string; status: number }).location).toBe(
        "/en/admin/users?tab=a",
      );
      expect((error as Error & { method: string; status: number }).method).toBe("replace");
      expect((error as Error & { status: number }).status).toBe(307);
    }
    try {
      router.redirect("/users?tab=a", { method: "push", status: 308 });
    } catch (error) {
      expect(error).toBeInstanceOf(AkanRedirectError);
      expect((error as Error & { method: string; status: number }).method).toBe("push");
      expect((error as Error & { status: number }).status).toBe(308);
    }
    envState.operationMode = "main";
    expect(() => router.redirect("/users?tab=a")).toThrow(AkanRedirectError);
    try {
      router.redirect("/users?tab=a");
    } catch (error) {
      expect(error).toBeInstanceOf(AkanRedirectError);
      expect((error as Error & { location: string; method: string }).location).toBe("/en/users?tab=a");
    }
    expect(() => router.notFound()).toThrow(AkanNotFoundError);
  });

  test("points a server-side push or replace at redirect(), which is what redirects there", async () => {
    envState.side = "server";
    const { router } = await import("./router");
    router.init({ type: "ssr", side: "server", lang: "en" });

    router.push("/users?tab=a");
    router.replace("/users");

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("router.push");
    expect(warnings[0]).toContain("/en/users?tab=a");
    expect(warnings[1]).toContain("router.replace");
    for (const warning of warnings) expect(warning).toContain("router.redirect()");
  });
});

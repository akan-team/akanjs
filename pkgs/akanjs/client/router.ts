import { getEnv } from "akanjs/base";
import { getBasePathFromPathname, Logger, parseAkanI18nEnv, parseBasePaths } from "akanjs/common";

export interface RouteOptions {
  scrollToTop?: boolean;
}

export interface RouterInstance {
  push: (href: string, routeOptions?: RouteOptions) => void;
  replace: (href: string, routeOptions?: RouteOptions) => void;
  back: (routeOptions?: RouteOptions) => void;
  refresh: () => void;
}
interface InternalRouterInstance {
  push: (href: string, routeOptions?: RouteOptions) => void;
  replace: (href: string, routeOptions?: RouteOptions) => void;
  back: (routeOptions?: RouteOptions) => void;
  refresh: () => void;
}
interface RouterOptions {
  prefix?: string;
  lang?: string;
}
interface SsrServerRouterOption extends RouterOptions {
  type: "ssr";
  side: "server";
}
interface SsrClientRouterOption extends RouterOptions {
  type: "ssr";
  side: "client";
  router: RouterInstance;
}
interface CSRClientRouterOption extends RouterOptions {
  type: "csr";
  router: RouterInstance;
}
export type RedirectMethod = "replace" | "push";
export type RedirectStatus = 303 | 307 | 308;
export interface RedirectOptions {
  method?: RedirectMethod;
  status?: RedirectStatus;
}

export class AkanRedirectError extends Error {
  readonly digest = "AKAN_REDIRECT";
  constructor(
    readonly location: string,
    readonly method: RedirectMethod = "replace",
    readonly status: RedirectStatus = 307,
  ) {
    super(`Redirect to ${location}`);
    this.name = "AkanRedirectError";
  }
}

export class AkanNotFoundError extends Error {
  readonly digest = "AKAN_NOT_FOUND";
  constructor() {
    super("Not found");
    this.name = "AkanNotFoundError";
  }
}

function getServerRequestContext() {
  const { untrackedHeaders, untrackedRequest } = require("akanjs/fetch");
  return { getRequest: untrackedRequest, headers: untrackedHeaders } as {
    getRequest: () => Request | undefined;
    headers: () => Map<string, string>;
  };
}

const getConfiguredBasePaths = () => new Set(parseBasePaths(process.env.AKAN_PUBLIC_BASE_PATHS));

const shouldExposeBasePath = () => getEnv().operationMode === "local";
const CSR_RUNTIME_SEARCH_PARAMS = ["csr", "akanMobileTarget", "akanMobileBasePath"] as const;

const getLocaleFromPathname = (pathname: string) => {
  const [firstSegment] = pathname.split("/").filter(Boolean);
  return parseAkanI18nEnv().locales.find((locale) => locale === firstSegment);
};

const getServerBasePath = (reqPathname: string, lang: string, headerBasePath: string | undefined, fallback: string) => {
  return (
    getBasePathFromPathname(reqPathname, {
      basePaths: getConfiguredBasePaths(),
      i18n: { locales: [lang], defaultLocale: lang },
      headerBasePath,
    }) ?? fallback
  );
};

declare global {
  var __AKAN_ROUTER__: Router | undefined;
  var __AKAN_DEV_SYNC_NAVIGATION__: ((href: string, kind: "push" | "replace" | "back" | "pop") => void) | undefined;
  var __AKAN_DEV_SYNC_NAVIGATION_APPLYING__: boolean | undefined;
}

export const getPathInfo = (requestUrl: string, lang: string, prefix: string) => {
  const [urlWithoutHash, hash = ""] = requestUrl.split("#");
  const [url, search = ""] = urlWithoutHash.split("?");
  const langLength = lang.length + 1;
  const pathWithSubRoute = url === `/${lang}` ? "/" : url.startsWith(`/${lang}/`) ? url.slice(langLength) : url;
  const prefixLength = prefix ? prefix.length + 1 : 0;
  const path = !prefixLength
    ? pathWithSubRoute
    : pathWithSubRoute === `/${prefix}`
      ? "/"
      : pathWithSubRoute.startsWith(`/${prefix}`)
        ? pathWithSubRoute.slice(prefixLength)
        : pathWithSubRoute;
  const subRoute = prefix ? `/${prefix}` : "";
  const pathname = path.startsWith("http") ? path : path === "/" ? `/${lang}${subRoute}` : `/${lang}${subRoute}${path}`;
  const href = `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
  return { path, pathname, hash, search, href };
};
class Router {
  isInitialized = false;
  #prefix = "";
  #lang = parseAkanI18nEnv().defaultLocale;
  #instance: InternalRouterInstance = {
    push: (href: string) => {
      const { href: fullHref } = this.#getPathInfo(href);
      Logger.log(`push to:${fullHref}`);
      // ! need to revive
      // if (getEnv().side === "server") void redirect(fullHref);
    },
    replace: (href: string) => {
      const { pathname } = this.#getPathInfo(href);
      Logger.log(`replace to:${pathname}`);
      // ! need to revive
      // if (getEnv().side === "server") void redirect(fullHref);
    },
    back: () => {
      throw new Error("back is only available in client");
    },
    refresh: () => {
      throw new Error("refresh is only available in client");
    },
  };
  init(options: SsrClientRouterOption | SsrServerRouterOption | CSRClientRouterOption) {
    // if (this.isInitialized) throw new Error("Router is already initialized");
    this.#prefix = options.prefix ?? "";
    this.#lang = options.lang ?? parseAkanI18nEnv().defaultLocale;
    if (options.type === "csr") this.#initCsrClientRouter(options);
    else if (options.side === "server") this.#initSsrServerRouter(options);
    else this.#initSsrClientRouter(options);
    this.isInitialized = true;
    Logger.verbose("Router initialized");
  }
  #initSsrServerRouter(options: SsrServerRouterOption) {
    // already initialized in next server
  }
  #initSsrClientRouter(options: SsrClientRouterOption) {
    this.#instance = {
      push: (href: string, routeOptions) => {
        const router = options.router;
        const pathInfo = this.#getPathInfo(href);
        const navigationPathInfo = this.#getNavigationPathInfo(href);
        this.#postPathChange(pathInfo);
        router.push(navigationPathInfo.href, routeOptions);
      },
      replace: (href: string, routeOptions) => {
        const router = options.router;
        const pathInfo = this.#getPathInfo(href);
        const navigationPathInfo = this.#getNavigationPathInfo(href);
        this.#postPathChange(pathInfo);
        router.replace(navigationPathInfo.href, routeOptions);
      },
      back: () => {
        const router = options.router;
        const pathInfo = this.#getPathInfo(document.referrer);
        this.#postPathChange(pathInfo);
        router.back();
      },
      refresh: () => {
        const router = options.router;
        const pathInfo = this.#getPathInfo(location.pathname);
        this.#postPathChange(pathInfo);
        router.refresh();
      },
    };
  }
  #initCsrClientRouter(options: CSRClientRouterOption) {
    this.#instance = {
      push: (href: string, routeOptions) => {
        const { path, pathname, hash, href: fullHref } = this.#getPathInfo(href);
        this.#postPathChange({ path, pathname, hash });
        options.router.push(this.#withCsrRuntimeSearchParams(fullHref), routeOptions);
      },
      replace: (href: string, routeOptions) => {
        const { path, pathname, hash, href: fullHref } = this.#getPathInfo(href);
        this.#postPathChange({ path, pathname, hash });
        // for avoiding set state while rendering in redirect
        setTimeout(() => {
          options.router.replace(this.#withCsrRuntimeSearchParams(fullHref), routeOptions);
        }, 0);
      },
      back: (routeOptions) => {
        const { path, pathname, hash } = this.#getPathInfo(document.referrer);
        this.#postPathChange({ path, pathname, hash });
        options.router.back(routeOptions);
      },
      refresh: () => {
        const { path, pathname, hash } = this.#getPathInfo(location.pathname);
        this.#postPathChange({ path, pathname, hash });
        options.router.refresh();
      },
    };
  }
  #checkInitialized() {
    if (!this.isInitialized) throw new Error("Router is not initialized");
  }

  #getPathInfo(href: string, prefix = this.#prefix) {
    return getPathInfo(href, this.#lang, prefix);
  }
  #getNavigationPathInfo(href: string) {
    return this.#getPathInfo(href, shouldExposeBasePath() ? this.#prefix : "");
  }
  #withCsrRuntimeSearchParams(href: string) {
    const currentSearch = new URLSearchParams(window.location.search);
    if (currentSearch.get("csr") !== "true") return href;

    const [hrefWithoutHash, hash = ""] = href.split("#");
    const [pathname, search = ""] = hrefWithoutHash.split("?");
    const nextSearch = new URLSearchParams(search);
    for (const param of CSR_RUNTIME_SEARCH_PARAMS) {
      if (nextSearch.has(param)) continue;
      const value = currentSearch.get(param);
      if (value !== null) nextSearch.set(param, value);
    }
    const query = nextSearch.toString();
    return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  }
  #getVisiblePathInfo(href: string, lang = this.#lang) {
    return getPathInfo(href, lang, shouldExposeBasePath() ? this.#prefix : "");
  }
  #postPathChange({ path, pathname, hash }: { path: string; pathname: string; hash: string }) {
    Logger.log(`pathChange-start:${path}${hash ? `#${hash}` : ""}`);
    window.parent.postMessage({ type: "pathChange", path, pathname, hash }, "*");
  }
  #postDevSyncNavigation(kind: "push" | "replace", href: string) {
    if (globalThis.__AKAN_DEV_SYNC_NAVIGATION_APPLYING__) return;
    const { path, search, hash } = this.#getPathInfo(href);
    globalThis.__AKAN_DEV_SYNC_NAVIGATION__?.(`${path}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`, kind);
  }
  push(href: string, routeOptions?: RouteOptions) {
    this.#checkInitialized();
    this.#instance.push(href, routeOptions);
    this.#postDevSyncNavigation("push", href);
    return undefined as never;
  }
  replace(href: string, routeOptions?: RouteOptions) {
    this.#checkInitialized();
    this.#instance.replace(href, routeOptions);
    this.#postDevSyncNavigation("replace", href);
    return undefined as never;
  }
  back(routeOptions?: RouteOptions) {
    if (getEnv().side === "server") throw new Error("back is only available in client side");
    // history보고 뒤로갈지 끌지 정하던가 먹통하던가
    this.#checkInitialized();
    this.#instance.back(routeOptions);
    return undefined as never;
  }
  refresh() {
    if (getEnv().side === "server") throw new Error("refresh is only available in client side");
    this.#checkInitialized();
    this.#instance.refresh();
    return undefined as never;
  }
  redirect(href: string, options: RedirectOptions = {}): never {
    const method = options.method ?? "replace";
    const status = options.status ?? 307;
    if (getEnv().side === "server") {
      const { getRequest, headers: requestHeaders } = getServerRequestContext();
      const h = requestHeaders();
      const req = getRequest();
      const reqPathname = req ? new URL(req.url).pathname : "";
      const langFromPath = reqPathname.split("/").filter(Boolean)[0];
      const lang = (h.get("x-locale") ?? langFromPath ?? this.#lang) as string;
      const basePath = getServerBasePath(reqPathname, lang, h.get("x-base-path") ?? undefined, this.#prefix);
      const { pathname, href: fullHref } = getPathInfo(href, lang, shouldExposeBasePath() ? basePath : "");
      Logger.log(`redirect to:${pathname}`);
      throw new AkanRedirectError(fullHref, method, status);
    } else {
      this.#instance[method](href);
    }
    return undefined as never;
  }
  notFound(): never {
    if (getEnv().side === "server") {
      Logger.log(`redirect to:/404`);
      throw new AkanNotFoundError();
    }
    this.#checkInitialized();
    this.#instance.replace("/404");
    return undefined as never;
  }
  setLang(lang: string) {
    if (getEnv().side === "server") throw new Error("setLang is only available in client side");
    this.#checkInitialized();
    const currentLang = getLocaleFromPathname(window.location.pathname) ?? this.#lang;
    const { path, search, hash } = this.#getVisiblePathInfo(
      `${window.location.pathname}${window.location.search ?? ""}${window.location.hash ?? ""}`,
      currentLang,
    );
    this.#lang = lang;
    this.#instance.replace(`${path}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`);
    return undefined as never;
  }
  getPath(pathname = window.location.pathname) {
    if (getEnv().side === "server") throw new Error("getPath is only available in client side");
    const { path } = getPathInfo(pathname, this.#lang, this.#prefix);
    return path;
  }
  getFullPath(withLang = true) {
    if (getEnv().side === "server") throw new Error("getPath is only available in client side");
    return `${withLang ? `/${this.#lang}/` : ""}${this.#prefix}${this.getPath()}`;
  }
  getPrefix() {
    return this.#prefix;
  }
  getPrefixedPath(path: string) {
    return this.#prefix ? `${this.#lang ? `/${this.#lang}` : ""}/${this.#prefix}${path}` : path;
  }
}
const browserRouter = () => {
  if (!globalThis.__AKAN_ROUTER__) globalThis.__AKAN_ROUTER__ = new Router();
  return globalThis.__AKAN_ROUTER__;
};

let serverRouter: Router | undefined;
const getRouter = () => {
  if (getEnv().side !== "server") return browserRouter();
  serverRouter ??= new Router();
  return serverRouter;
};

/** Akan navigation singleton that normalizes language/base-path prefixes before routing. */
export const router = new Proxy({} as Router, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getRouter(), prop, receiver);
    return typeof value === "function" ? value.bind(getRouter()) : value;
  },
});

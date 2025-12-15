/* eslint-disable @typescript-eslint/no-require-imports */

import { baseClientEnv } from "@akanjs/base";
import { Logger } from "@akanjs/common";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { notFound, redirect } from "next/navigation";

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
interface NextServerRouterOption extends RouterOptions {
  type: "next";
  side: "server";
}
interface NextClientRouterOption extends RouterOptions {
  type: "next";
  side: "client";
  router: RouterInstance;
}
interface CSRClientRouterOption extends RouterOptions {
  type: "csr";
  router: RouterInstance;
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
  #lang = "en";
  #instance: InternalRouterInstance = {
    push: (href: string) => {
      const { pathname, search, hash, href: fullHref } = this.#getPathInfo(href);
      Logger.log(`push to:${fullHref}`);
      if (baseClientEnv.side === "server") void redirect(fullHref);
    },
    replace: (href: string) => {
      const { pathname, search, hash, href: fullHref } = this.#getPathInfo(href);
      Logger.log(`replace to:${pathname}`);
      if (baseClientEnv.side === "server") void redirect(fullHref);
    },
    back: () => {
      throw new Error("back is only available in client");
    },
    refresh: () => {
      throw new Error("refresh is only available in client");
    },
  };
  init(options: NextClientRouterOption | NextServerRouterOption | CSRClientRouterOption) {
    // if (this.isInitialized) throw new Error("Router is already initialized");
    this.#prefix = options.prefix ?? "";
    this.#lang = options.lang ?? "en";
    if (options.type === "csr") this.#initCSRClientRouter(options);
    else if (options.side === "server") this.#initNextServerRouter(options);
    else this.#initNextClientRouter(options);
    this.isInitialized = true;
    Logger.verbose("Router initialized");
  }
  #initNextServerRouter(options: NextServerRouterOption) {
    // already initialized in next server
  }
  #initNextClientRouter(options: NextClientRouterOption) {
    this.#instance = {
      push: (href: string) => {
        const router = options.router as unknown as AppRouterInstance;
        const pathInfo = this.#getPathInfo(href);
        this.#postPathChange(pathInfo);
        router.push(pathInfo.href);
      },
      replace: (href: string) => {
        const router = options.router as unknown as AppRouterInstance;
        const pathInfo = this.#getPathInfo(href);
        this.#postPathChange(pathInfo);
        router.replace(pathInfo.href);
      },
      back: () => {
        const router = options.router as unknown as AppRouterInstance;
        const pathInfo = this.#getPathInfo(document.referrer);
        this.#postPathChange(pathInfo);
        router.back();
      },
      refresh: () => {
        const router = options.router as unknown as AppRouterInstance;
        const pathInfo = this.#getPathInfo(location.pathname);
        this.#postPathChange(pathInfo);
        router.refresh();
      },
    };
  }
  #initCSRClientRouter(options: CSRClientRouterOption) {
    this.#instance = {
      push: (href: string, routeOptions) => {
        const { path, pathname, hash, href: fullHref } = this.#getPathInfo(href);
        this.#postPathChange({ path, pathname, hash });
        options.router.push(fullHref, routeOptions);
      },
      replace: (href: string, routeOptions) => {
        const { path, pathname, hash, href: fullHref } = this.#getPathInfo(href);
        this.#postPathChange({ path, pathname, hash });
        // for avoiding set state while rendering in redirect
        setTimeout(() => {
          options.router.replace(fullHref, routeOptions);
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
  #postPathChange({ path, pathname, hash }: { path: string; pathname: string; hash: string }) {
    Logger.log(`pathChange-start:${path}${hash ? `#${hash}` : ""}`);
    window.parent.postMessage({ type: "pathChange", path, pathname, hash }, "*");
  }
  push(href: string, routeOptions?: RouteOptions) {
    this.#checkInitialized();
    this.#instance.push(href, routeOptions);
    return undefined as never;
  }
  replace(href: string, routeOptions?: RouteOptions) {
    this.#checkInitialized();
    this.#instance.replace(href, routeOptions);
    return undefined as never;
  }
  back(routeOptions?: RouteOptions) {
    if (baseClientEnv.side === "server") throw new Error("back is only available in client side");
    // history보고 뒤로갈지 끌지 정하던가 먹통하던가
    this.#checkInitialized();
    this.#instance.back(routeOptions);
    return undefined as never;
  }
  refresh() {
    if (baseClientEnv.side === "server") throw new Error("refresh is only available in client side");
    this.#checkInitialized();
    this.#instance.refresh();
    return undefined as never;
  }
  async redirect(href: string) {
    if (baseClientEnv.side === "server") {
      const nextHeaders = require("next/headers") as { headers?: () => Promise<Map<string, string>> };
      const headers = (await nextHeaders.headers?.()) ?? new Map();
      const lang = (headers.get("x-locale") ?? this.#lang) as string;
      const basePath = headers.get("x-base-path") as string | undefined;
      const { pathname, search, href: fullHref, hash } = getPathInfo(href, lang, basePath ?? "");
      Logger.log(`redirect to:${pathname}`);
      //full href로 리다이렉트하면 문제가 될지 확인
      redirect(fullHref);
    } else {
      this.#instance.replace(href);
    }
    return undefined as never;
  }
  notFound(): never {
    this.#checkInitialized();
    if (baseClientEnv.side === "server") {
      Logger.log(`redirect to:/404`);
      notFound();
    } else this.#instance.replace("/404");
    return undefined as never;
  }
  setLang(lang: string) {
    if (baseClientEnv.side === "server") throw new Error("setLang is only available in client side");
    this.#checkInitialized();
    const { path, search, hash, href: fullHref } = getPathInfo(window.location.pathname, this.#lang, this.#prefix);
    this.#lang = lang;
    this.#instance.replace(`/${lang}${path}`);
    return undefined as never;
  }
  getPath(pathname = window.location.pathname) {
    if (baseClientEnv.side === "server") throw new Error("getPath is only available in client side");
    const { path } = getPathInfo(pathname, this.#lang, this.#prefix);
    return path;
  }
  getFullPath(withLang = true) {
    if (baseClientEnv.side === "server") throw new Error("getPath is only available in client side");
    return `${withLang ? `/${this.#lang}/` : ""}${this.#prefix}${this.getPath()}`;
  }
  getPrefix() {
    return this.#prefix;
  }
  getPrefixedPath(path: string) {
    return this.#prefix ? `${this.#lang ? `/${this.#lang}` : ""}/${this.#prefix}${path}` : path;
  }
}
export const router = new Router();

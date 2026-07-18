"use client";

import { getEnv } from "akanjs/base";
import { clsx, getPathInfo, router, usePage, usePathCtx } from "akanjs/client";
import { Logger } from "akanjs/common";
import type { SsrLinkProps } from "./types";

export default function SsrLink({
  className,
  children,
  disabled,
  href,
  scrollToTop,
  replace,
  activeClassName,
  activeExact,
  noCache,
  ...props
}: SsrLinkProps) {
  const pathCtx = usePathCtx();
  const prefix = pathCtx.prefix;
  const { lang, path: pagePath } = usePage();
  const currentPath = pathCtx.location?.pathRoute?.path ?? getPathInfo(pagePath, lang, prefix ?? "").path;
  const isExternal = href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:");
  const internalPathInfo = getPathInfo(href, lang, prefix ?? "");
  const publicPathInfo = getPathInfo(href, lang, "");
  const requestHref = getEnv().operationMode === "local" ? internalPathInfo.href : publicPathInfo.href;
  const path = internalPathInfo.path;
  if (href.startsWith("#")) {
    return (
      <a className={clsx(className, { [activeClassName ?? ""]: currentPath === path })} href={href}>
        {children}
      </a>
    );
  }
  return (
    <a
      className={clsx(className, {
        [activeClassName ?? ""]: activeExact ? currentPath === path : currentPath.startsWith(path),
      })}
      href={isExternal ? href : href.startsWith("#") ? href : requestHref}
      // passHref
      // replace={replace}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (event.defaultPrevented) return;
        if (disabled) {
          event.preventDefault();
          return;
        }
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (isExternal || href.startsWith("#")) return;
        const rscNavigationReady =
          typeof (globalThis as typeof globalThis & { __AKAN_RSC_NAVIGATE__?: unknown }).__AKAN_RSC_NAVIGATE__ ===
          "function";
        if (!router.isInitialized || !rscNavigationReady) return;
        event.preventDefault();
        try {
          if (replace) router.replace(href, { scrollToTop });
          else router.push(href, { scrollToTop });
        } catch (error) {
          Logger.warn(`SSR link navigation failed, falling back to document navigation: ${String(error)}`);
          if (replace) window.location.replace(requestHref);
          else window.location.assign(requestHref);
        }
      }}
    >
      {children}
    </a>
  );
}

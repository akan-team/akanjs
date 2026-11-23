"use client";
import { getEnv } from "akanjs/base";
import {
  cn,
  csrLocation,
  getPathInfo,
  Href,
  openExternalUrl,
  router,
  ShellState,
  usePage,
  usePathCtx,
} from "akanjs/client";
import { Logger } from "akanjs/common";
import type { AnchorHTMLAttributes } from "react";
import { PendingNavigation } from "../../client/pendingNavigation";
import { isActiveHref, useCurrentPathname } from "./activePath";
import { type LinkPrefetch, usePrefetchIntent } from "./prefetchIntent";

export type CommonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  /** Omitted, or with `disabled`, Link renders a plain div around the same children. */
  href?: string | null;
  disabled?: boolean;
  scrollToTop?: boolean;
  /** Replaces the current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Applied while the current page is `href` or below it, or exactly `href` with `activeExact`; basePath-aware. */
  activeClassName?: string;
  activeExact?: boolean;
  /** More paths under which the link counts as active, as a tab does for its detail pages. */
  activeMatch?: string[];
  /** Applied, with `data-pending`, while a page this link would be active on loads; never for one already held. */
  pendingClassName?: string;
  /** @deprecated Has no effect: neither renderer reads it. */
  noCache?: boolean;
  /** `"hover"` (the default, or `true`) loads the page on hover or keyboard focus, `"viewport"` also once it shows. */
  prefetch?: LinkPrefetch;
};
type AnchorProps = Omit<CommonLinkProps, "href" | "disabled"> & { href: string };

const usePendingLink = ({ href, ...active }: Omit<Parameters<typeof isActiveHref>[0], "pathname">) =>
  PendingNavigation.use(
    (pendingHref) =>
      !!pendingHref &&
      !Href.isExternal(href) &&
      !href.startsWith("#") &&
      isActiveHref({ pathname: new URL(pendingHref).pathname, href, ...active }),
  );

export const CsrLink = ({
  className,
  children,
  href,
  replace,
  activeClassName,
  scrollToTop,
  activeExact,
  activeMatch,
  pendingClassName,
  noCache,
  prefetch,
  ...props
}: AnchorProps) => {
  const { prefix } = usePathCtx();
  const pathname = ShellState.use("pathname");
  const { lang } = usePage();
  const { hash } = getPathInfo(href, lang, prefix ?? "");
  const active =
    !!activeClassName &&
    isActiveHref({ pathname, href, lang, prefix: prefix ?? "", exact: activeExact, match: activeMatch });
  const pending = usePendingLink({ href, lang, prefix: prefix ?? "", exact: activeExact, match: activeMatch });
  return (
    <a
      className={cn("cursor-pointer", className, active && activeClassName, pending && pendingClassName)}
      data-pending={pending ? "" : undefined}
      {...props}
      onClick={(event) => {
        props.onClick?.(event);
        if (event.defaultPrevented) return;
        const isExternal = Href.isExternal(href);
        const url = href.startsWith("#") ? `${csrLocation.pathname}#${hash}` : href;
        if (isExternal) {
          const target = Href.toExternalUrl(href, document.baseURI);
          void openExternalUrl(target).catch((error: unknown) => {
            if (!(error instanceof Error && "code" in error && error.code === "NOT_ALLOWED"))
              window.open(target, "_blank", "noopener,noreferrer");
          });
        } else if (replace) router.replace(url, { scrollToTop });
        else router.push(url, { scrollToTop });
      }}
    >
      {children}
    </a>
  );
};

export const SsrLink = ({
  className,
  children,
  href,
  scrollToTop,
  replace,
  activeClassName,
  activeExact,
  activeMatch,
  pendingClassName,
  noCache,
  prefetch = "hover",
  ...props
}: AnchorProps) => {
  const prefix = usePathCtx().prefix ?? "";
  const { lang } = usePage();
  const pathname = useCurrentPathname();
  const prefetchIntent = usePrefetchIntent(href, prefetch, props);
  const currentPath = getPathInfo(pathname, lang, prefix).path;
  const isExternal = Href.isExternal(href);
  const pending = usePendingLink({ href, lang, prefix, exact: activeExact, match: activeMatch });
  const internalPathInfo = getPathInfo(href, lang, prefix);
  const requestHref = getEnv().operationMode === "local" ? internalPathInfo.href : getPathInfo(href, lang, "").href;
  const path = internalPathInfo.path;
  if (href.startsWith("#"))
    return (
      <a className={cn(className, currentPath === path && activeClassName)} href={href} {...props}>
        {children}
      </a>
    );
  return (
    <a
      className={cn(
        className,
        !!activeClassName &&
          isActiveHref({ pathname, href, lang, prefix, exact: activeExact, match: activeMatch }) &&
          activeClassName,
        pending && pendingClassName,
      )}
      href={isExternal ? href : requestHref}
      data-pending={pending ? "" : undefined}
      {...props}
      {...prefetchIntent}
      onClick={(event) => {
        props.onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (isExternal) return;
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
};

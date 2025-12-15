"use client";

import { clsx, getPathInfo, usePage } from "@akanjs/client";
import { Logger } from "@akanjs/common";
import { st } from "@akanjs/store";
import NextjsLink from "next/link";

import type { NextLinkProps } from "./types";

export default function NextLink({
  className,
  children,
  disabled,
  href,
  scrollToTop,
  replace,
  activeClassName,
  ...props
}: NextLinkProps) {
  const prefix = st.use.prefix();
  const { lang } = usePage();
  const currentPath = st.use.path();
  const isExternal = href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:");
  const { href: requestHref, path } = getPathInfo(href, lang, prefix ?? "");
  if (href.startsWith("#")) {
    return (
      <a className={clsx(className, { [activeClassName ?? ""]: currentPath === path })} href={href}>
        {children}
      </a>
    );
  }
  return (
    <NextjsLink
      className={clsx(className, { [activeClassName ?? ""]: currentPath === path })}
      href={isExternal ? href : href.startsWith("#") ? href : requestHref}
      passHref
      replace={replace}
      onClick={() => {
        Logger.log(`pathChange-start:${requestHref}`);
        window.parent.postMessage({ type: "pathChange", href: requestHref }, "*");
        if (scrollToTop) window.scrollTo(0, 0);
      }}
      {...props}
    >
      {children}
    </NextjsLink>
  );
}

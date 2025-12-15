"use client";

import { clsx, getPathInfo, router, usePage } from "@akanjs/client";
import { st } from "@akanjs/store";
import { Browser } from "@capacitor/browser";

import type { CsrLinkProps } from "./types";

export default function CsrLink({
  className,
  children,
  href,
  replace,
  activeClassName,
  scrollToTop,
  ...props
}: CsrLinkProps) {
  const prefix = st.use.prefix();
  const currentPath = st.use.path();
  const { lang } = usePage();
  const { path, hash } = getPathInfo(href, lang, prefix ?? "");
  return (
    <a
      className={clsx("cursor-pointer", className, { [activeClassName ?? ""]: currentPath === path })}
      onClick={() => {
        const isExternal = href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:");
        const isHash = href.startsWith("#");
        const url = isHash ? `${window.location.pathname}#${hash}` : href;
        if (isExternal) void Browser.open({ url: href, presentationStyle: "popover" });
        else if (replace) router.replace(url, { scrollToTop });
        else router.push(url, { scrollToTop });
      }}
    >
      {children}
    </a>
  );
}

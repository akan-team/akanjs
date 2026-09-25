"use client";

import { clsx, getPathInfo, router, usePage, usePathCtx } from "akanjs/client";
import { loadCapacitorBrowser } from "akanjs/client/capacitor";
import { st } from "akanjs/store";

import type { CsrLinkProps } from "./types";

export default function CsrLink({
  className,
  children,
  href,
  replace,
  activeClassName,
  scrollToTop,
  activeExact,
  ...props
}: CsrLinkProps) {
  const pathCtx = usePathCtx();
  const prefix = pathCtx.prefix;
  const currentPath = st.use.path();
  const { lang } = usePage();
  const { path, hash } = getPathInfo(href, lang, prefix ?? "");
  return (
    <a
      className={clsx("cursor-pointer", className, {
        [activeClassName ?? ""]: activeExact ? currentPath === path : currentPath.startsWith(path),
      })}
      onClick={() => {
        const isExternal = href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:");
        const isHash = href.startsWith("#");
        const url = isHash ? `${window.location.pathname}#${hash}` : href;
        if (isExternal)
          void loadCapacitorBrowser()
            .then(({ Browser }) => Browser.open({ url: href, presentationStyle: "popover" }))
            .catch(() => window.open(href, "_blank", "noopener,noreferrer"));
        else if (replace) router.replace(url, { scrollToTop });
        else router.push(url, { scrollToTop });
      }}
    >
      {children}
    </a>
  );
}

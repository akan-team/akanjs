"use client";
import { router, setCookie } from "akanjs/client";
import { Logger, parseAkanI18nEnv } from "akanjs/common";
import { st } from "akanjs/store";
import type { McpAppBridge, McpHostContext } from "./McpAppBridge";
import { McpAppDownloads } from "./McpAppDownloads";
import { McpAppSize } from "./McpAppSize";

export class McpAppView {
  // The app's brand colors stay its own; radii are compiled into the app's classes, so they cannot follow.
  static readonly hostTokens = {
    "--color-background-primary": ["--background", "--card", "--popover"],
    "--color-background-secondary": ["--muted"],
    "--color-text-primary": ["--foreground", "--card-foreground", "--popover-foreground"],
    "--color-text-secondary": ["--muted-foreground"],
    "--color-border-primary": ["--border", "--input"],
    "--color-ring-primary": ["--ring"],
    "--font-sans": ["--font-sans"],
    "--font-mono": ["--font-mono"],
  } as const;

  readonly #bridge: McpAppBridge;
  readonly #size: McpAppSize;
  readonly #downloads: McpAppDownloads;
  #theme: string | undefined;

  constructor(bridge: McpAppBridge) {
    this.#bridge = bridge;
    this.#size = new McpAppSize(bridge);
    this.#downloads = new McpAppDownloads(bridge, (href) => McpAppView.#parse(href, McpAppView.#baseUrl()));
  }

  /** `href` in the host's language when the app speaks it: the page run used the server's MCP language. */
  static localize(href: string, locale: string | undefined, locales: readonly string[]) {
    const lang = locale?.split("-")[0]?.toLowerCase();
    const current = /^\/([^/?#]+)/.exec(href)?.[1];
    if (!lang || !current || !locales.includes(lang) || !locales.includes(current)) return href;
    return `/${lang}${href.slice(current.length + 1)}`;
  }

  mount() {
    this.#apply(this.#bridge.hostContext);
    this.#bridge.onHostContext((context) => this.#apply(context));
    this.#size.watch();
    this.#downloads.keepBlobs();
    this.#routeLinks();
  }

  /** In place of the app, for a result that names no screen: the host still sizes the view to what it shows. */
  showUnavailable(message: string) {
    this.#size.unwatch();
    this.#apply(this.#bridge.hostContext);
    const notice = document.createElement("p");
    notice.textContent = message;
    notice.style.cssText = "margin:0;padding:16px;font:14px/1.5 system-ui,sans-serif;color:var(--foreground)";
    document.getElementById("root")?.replaceChildren();
    document.body.style.overflow = "visible";
    document.body.replaceChildren(notice);
    this.#bridge.notify("ui/notifications/size-changed", { height: Math.ceil(notice.getBoundingClientRect().height) });
  }

  #apply({ theme, displayMode, styles }: McpHostContext) {
    const root = document.documentElement;
    root.dataset.akanEmbed = displayMode ?? "inline";
    //? Re-applied only when the host's theme moves, so a display-mode change leaves a choice made in the view alone.
    if (theme && theme !== this.#theme) {
      this.#theme = theme;
      setCookie("theme", theme);
      root.dataset.theme = theme;
      st.do.setTheme(theme);
      //? A host may send `light-dark()` values, which resolve against the color scheme.
      root.style.colorScheme = theme;
    }
    const variables = styles?.variables ?? {};
    for (const [hostKey, tokens] of Object.entries(McpAppView.hostTokens)) {
      const value = variables[hostKey];
      for (const token of tokens)
        if (value) root.style.setProperty(token, value);
        else root.style.removeProperty(token);
    }
  }

  // A link on the app's own origin under a locale is a route this bundle renders; anything else — another site, a
  // stored file — opens through the host, which is the only party a sandboxed view may ask to navigate.
  #routeLinks() {
    const { locales } = parseAkanI18nEnv();
    const baseUrl = McpAppView.#baseUrl();
    const base = McpAppView.#parse(baseUrl);
    const open = (raw: string) => {
      if (!raw) return;
      //? Against the `<base>`, a fragment alone would name the app's root route rather than a spot on this screen.
      if (raw.startsWith("#")) {
        document.getElementById(decodeURIComponent(raw.slice(1)))?.scrollIntoView();
        return;
      }
      const url = McpAppView.#parse(raw, baseUrl);
      if (!url) return;
      const [, lang] = url.pathname.split("/");
      //? The router puts the view's own locale in front, so a link written in another one keeps only its route.
      if (url.origin === base?.origin && lang && locales.includes(lang))
        router.push(`${url.pathname.slice(lang.length + 1) || "/"}${url.search}${url.hash}`);
      else if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol))
        this.#bridge.openLink(url.href).catch((error: unknown) => {
          Logger.warn(`The host did not open ${url.href}: ${error instanceof Error ? error.message : error}`);
        });
    };
    const download = (href: string, name: string | null) =>
      this.#downloads.save(href, name).catch((error: unknown) => {
        Logger.warn(`The host did not save ${href}: ${error instanceof Error ? error.message : error}`);
      });
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      event.preventDefault();
      const href = anchor.getAttribute("href") ?? "";
      if (!anchor.hasAttribute("download")) open(href);
      else void download(href, anchor.getAttribute("download"));
    });
    window.open = (url?: string | URL) => {
      if (url !== undefined) open(String(url));
      return null;
    };
    //? `a.click()` on an anchor never attached (FileSaver, hand-written exports) reaches no document listener.
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.isConnected || !this.hasAttribute("download")) click.call(this);
      else void download(this.getAttribute("href") ?? "", this.getAttribute("download"));
    };
  }

  //? A host may block the `<base>` (Claude does), which leaves `document.baseURI` on its own sandbox origin.
  static #baseUrl() {
    const origin = globalThis.__AKAN_EMBED__?.origin;
    return origin ? `${origin}/` : document.baseURI;
  }

  static #parse(raw: string, base?: string) {
    try {
      return new URL(raw, base);
    } catch {
      return null;
    }
  }
}

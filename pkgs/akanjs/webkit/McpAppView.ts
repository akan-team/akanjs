"use client";
import { csrLocation, setCookie } from "akanjs/client";
import { Logger } from "akanjs/common";
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

  /** `href` in the host's language when the app speaks it: the load ran in the server's MCP language. */
  static localize(href: string, locale: string | undefined, locales: readonly string[]) {
    const lang = McpAppView.languageOf(locale, locales);
    const current = /^\/([^/?#]+)/.exec(href)?.[1];
    if (!lang || !current || !locales.includes(current)) return href;
    return `/${lang}${href.slice(current.length + 1)}`;
  }

  /** The host's language when the app speaks it. */
  static languageOf(locale: string | undefined, locales: readonly string[]) {
    const lang = locale?.split("-")[0]?.toLowerCase();
    return lang && locales.includes(lang) ? lang : undefined;
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

  //? Through the host, the only party a sandboxed view may ask to navigate. An app path opens its web page: a view
  //? draws one component and has no router to move to another screen.
  open(raw: string) {
    if (!raw) return;
    //? A fragment on this screen scrolls the view: against the `<base>` it would name the app's root route, and a
    //? `<Link href="#x">` arrives as the screen's own path with it.
    const hashAt = raw.indexOf("#");
    if (hashAt === 0 || (hashAt > 0 && raw.slice(0, hashAt) === csrLocation.pathname)) {
      McpAppView.#targetOf(raw.slice(hashAt + 1))?.scrollIntoView();
      return;
    }
    const url = McpAppView.#parse(raw, McpAppView.#baseUrl());
    if (!url || !["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return;
    this.#bridge.openLink(url.href).catch((error: unknown) => {
      Logger.warn(`The host did not open ${url.href}: ${error instanceof Error ? error.message : error}`);
    });
  }

  #routeLinks() {
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
      if (!anchor.hasAttribute("download")) this.open(href);
      else void download(href, anchor.getAttribute("download"));
    });
    window.open = (url?: string | URL) => {
      if (url !== undefined) this.open(String(url));
      return null;
    };
    //? `a.click()` on an anchor never attached (FileSaver, hand-written exports) reaches no document listener.
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.isConnected || !this.hasAttribute("download")) click.call(this);
      else void download(this.getAttribute("href") ?? "", this.getAttribute("download"));
    };
  }

  //? As a browser finds it: the id as written first, then percent-decoded, where an escape that is not one (`#50%`)
  //? stays as written instead of failing the whole fragment.
  static #targetOf(fragment: string) {
    const decoded = fragment.replace(/(?:%[0-9A-Fa-f]{2})+/g, (escapes) => {
      try {
        return decodeURIComponent(escapes);
      } catch {
        return escapes;
      }
    });
    return document.getElementById(fragment) ?? document.getElementById(decoded);
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

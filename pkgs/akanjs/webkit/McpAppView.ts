"use client";
import { router, setCookie } from "akanjs/client";
import { Logger, parseAkanI18nEnv } from "akanjs/common";
import { st } from "akanjs/store";
import type { McpAppBridge, McpDownloadContent, McpHostContext } from "./McpAppBridge";

export class McpAppView {
  static readonly contentGap = 24;
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
  readonly #blobs = new Map<string, Blob>();
  #lastHeight = 0;
  #theme: string | undefined;

  constructor(bridge: McpAppBridge) {
    this.#bridge = bridge;
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
    this.#watchSize();
    this.#keepBlobs();
    this.#routeLinks();
  }

  /** In place of the app, for a result that names no screen: the host still sizes the view to what it shows. */
  showUnavailable(message: string) {
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

  // The CSR frame is one viewport tall and scrolls the page inside it, so the document is always as tall as the iframe
  // the host sized from the last report. The current page's content height is what the host must size to instead.
  #watchSize() {
    let scheduled = false;
    const report = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const height = McpAppView.#contentHeight();
        if (height === this.#lastHeight) return;
        this.#lastHeight = height;
        this.#bridge.notify("ui/notifications/size-changed", { height });
      });
    };
    const resized = new ResizeObserver(report);
    resized.observe(document.documentElement);
    const observeContent = () => {
      for (const content of document.querySelectorAll(".akan-page-content"))
        for (const child of content.children) resized.observe(child);
    };
    new MutationObserver(() => {
      observeContent();
      report();
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
    //? An image or a font settling resizes boxes without a mutation or a document resize.
    document.addEventListener("load", report, true);
    void document.fonts.ready.then(report);
    observeContent();
    report();
  }

  // A screen built for a phone fills it (`min-h-screen`), so a box tied to the viewport says nothing about the content:
  // one as tall as the viewport, or ending at its bottom edge, is walked into, and a fixed one is left out, or each
  // report would grow the next. A zero-height box is walked into too: `display: contents` reports one.
  static #contentHeight() {
    const content = document.querySelector<HTMLElement>('[id^="pageContainer-"]:not([inert]) .akan-page-content');
    if (!content) return Math.ceil(document.documentElement.scrollHeight);
    const viewport = window.innerHeight;
    const style = getComputedStyle(content);
    const top = content.getBoundingClientRect().top - content.scrollTop;
    let bottom = top + Number.parseFloat(style.paddingTop || "0");
    const pending: Element[] = [content];
    for (let box = pending.pop(); box; box = pending.pop())
      for (const child of box.children) {
        const rect = child.getBoundingClientRect();
        if (getComputedStyle(child).position === "fixed") continue;
        if (rect.height === 0 || rect.height >= viewport - 1 || Math.abs(rect.bottom - viewport) <= 1)
          pending.push(child);
        else bottom = Math.max(bottom, rect.bottom);
      }
    const height = bottom - top + Number.parseFloat(style.paddingBottom || "0") + McpAppView.contentGap;
    return Math.ceil(Math.max(height + McpAppView.#overlayHeight(), McpAppView.#dialogHeight()));
  }

  // A card the view pins over its own bottom edge (an approval) must not cover the screen it asks about.
  static #overlayHeight() {
    let height = 0;
    for (const overlay of document.querySelectorAll<HTMLElement>("[data-akan-embed-overlay]"))
      height += overlay.getBoundingClientRect().height;
    return height;
  }

  // A modal is portaled out of the page and clamped to the viewport, so the frame must grow to the panel's own height.
  static #dialogHeight() {
    let height = 0;
    for (const dialog of document.querySelectorAll<HTMLElement>('[aria-modal="true"]')) {
      if (!dialog.getClientRects().length) continue;
      let natural = 0;
      for (const child of dialog.children)
        if (!["absolute", "fixed"].includes(getComputedStyle(child).position)) natural += child.scrollHeight;
      height = Math.max(height, natural + McpAppView.contentGap * 2);
    }
    return height;
  }

  // A link on the app's own origin under a locale is a route this bundle renders; anything else — another site, a
  // stored file — opens through the host, which is the only party a sandboxed view may ask to navigate.
  #routeLinks() {
    const { locales } = parseAkanI18nEnv();
    const base = McpAppView.#parse(document.baseURI);
    const open = (raw: string) => {
      if (!raw) return;
      //? Against the `<base>`, a fragment alone would name the app's root route rather than a spot on this screen.
      if (raw.startsWith("#")) {
        document.getElementById(decodeURIComponent(raw.slice(1)))?.scrollIntoView();
        return;
      }
      const url = McpAppView.#parse(raw, document.baseURI);
      if (!url) return;
      const [, lang] = url.pathname.split("/");
      if (url.origin === base?.origin && lang && locales.includes(lang))
        router.push(`${url.pathname}${url.search}${url.hash}`);
      else if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol))
        this.#bridge.openLink(url.href).catch((error: unknown) => {
          Logger.warn(`The host did not open ${url.href}: ${error instanceof Error ? error.message : error}`);
        });
    };
    const download = (href: string, name: string | null) =>
      this.#download(href, name).catch((error: unknown) => {
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

  // The sandbox has no `allow-downloads`, so a file is handed to the host to save. Its bytes are read here: the host
  // cannot reach a `blob:` URL, and a data or blob read by `fetch` is a connection the view's CSP refuses.
  async #download(href: string, suggested: string | null) {
    const content = await this.#downloadOf(href, suggested || null);
    if (!content) throw new Error("it is neither a web address nor a file this view made");
    if (this.#bridge.hostCapabilities.downloadFile) await this.#bridge.downloadFile([content]);
    else if (content.type === "resource_link") await this.#bridge.openLink(content.uri);
    else throw new Error("this host does not save files");
  }

  async #downloadOf(href: string, suggested: string | null): Promise<McpDownloadContent | null> {
    const blob = this.#blobs.get(href) ?? (href.startsWith("data:") ? McpAppView.#dataBlob(href) : null);
    if (blob) {
      const name = suggested ?? "download";
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return {
        type: "resource",
        resource: {
          uri: `file:///${encodeURIComponent(name)}`,
          mimeType: blob.type || "application/octet-stream",
          blob: McpAppView.#base64(bytes),
        },
      };
    }
    const url = McpAppView.#parse(href, document.baseURI);
    if (!url || !["http:", "https:"].includes(url.protocol)) return null;
    return { type: "resource_link", uri: url.href, name: suggested ?? url.pathname.split("/").at(-1) ?? "download" };
  }

  //? `downloadBlob` revokes its URL right after the click, so the blob is held from the moment the URL is made.
  #keepBlobs() {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object);
      if (object instanceof Blob) this.#blobs.set(url, object);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      this.#blobs.delete(url);
      revoke(url);
    };
  }

  static #dataBlob(href: string) {
    const match = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(href);
    if (!match) return null;
    const [, type = "", base64, body = ""] = match;
    const bytes = base64
      ? Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(body));
    return new Blob([bytes], { type: type.split(";")[0] });
  }

  static #base64(bytes: Uint8Array) {
    let binary = "";
    for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    return btoa(binary);
  }

  static #parse(raw: string, base?: string) {
    try {
      return new URL(raw, base);
    } catch {
      return null;
    }
  }
}

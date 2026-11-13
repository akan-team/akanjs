import type { AkanHeadSnapshotNode, RouteViewport } from "./csrTypes";

export interface ThemeColorTag {
  content: string;
  media?: string;
}

/** Turns a root layout's `.viewport()` into the `viewport` and `theme-color` meta tags every document shell writes. */
export class ViewportMeta {
  static readonly #offMedia = "not all";
  static readonly #ownAttr = "data-akan-theme-color";
  static readonly #mutedAttr = "data-akan-media";
  static readonly #viewportAttr = "data-akan-viewport";
  static readonly #themeColorVar = "--akan-theme-color";

  static content(viewport: RouteViewport | undefined, { native = false }: { native?: boolean } = {}): string {
    const parts = ["width=device-width", "initial-scale=1"];
    if (viewport?.fitCover ?? native) parts.push("viewport-fit=cover");
    if (viewport?.interactiveWidget) parts.push(`interactive-widget=${viewport.interactiveWidget}`);
    return parts.join(", ");
  }

  /** The request's theme when it is known; otherwise `light`/`dark` follow the OS until the client names the theme. */
  static themeColors(viewport: RouteViewport | undefined, theme?: string): ThemeColorTag[] {
    const themeColor = viewport?.themeColor;
    if (!themeColor) return [];
    if (typeof themeColor === "string") return [{ content: themeColor }];
    const named = theme && Object.hasOwn(themeColor, theme) ? themeColor[theme] : undefined;
    if (named) return [{ content: named }];
    const schemes = (["light", "dark"] as const)
      .filter((scheme) => themeColor[scheme])
      .map((scheme) => ({ content: themeColor[scheme] ?? "", media: `(prefers-color-scheme: ${scheme})` }));
    if (schemes.length) return schemes;
    const first = Object.values(themeColor)[0];
    return first ? [{ content: first }] : [];
  }

  static themeColorNodes(viewport: RouteViewport | undefined, theme?: string): AkanHeadSnapshotNode[] {
    return ViewportMeta.themeColors(viewport, theme).map(({ content, media }) => ({
      tag: "meta",
      attrs: { name: "theme-color", content, ...(media ? { media } : {}), [ViewportMeta.#viewportAttr]: "" },
    }));
  }

  static applyContent(viewport: RouteViewport | undefined, { native = false }: { native?: boolean } = {}) {
    const meta = ViewportMeta.#ensureMeta("viewport");
    const content = ViewportMeta.content(viewport, { native });
    if (meta.content !== content) meta.content = content;
  }

  static runtimeThemeColor(): string | null {
    return getComputedStyle(document.documentElement).getPropertyValue(ViewportMeta.#themeColorVar).trim() || null;
  }

  static applyThemeColor(viewport: RouteViewport | undefined, theme?: string): string | null {
    const runtime = ViewportMeta.runtimeThemeColor();
    const existing = [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const authored = existing.filter(
      (meta) => !meta.hasAttribute(ViewportMeta.#ownAttr) && !meta.hasAttribute(ViewportMeta.#viewportAttr),
    );
    if (!runtime && authored.length) {
      for (const meta of existing) {
        if (meta.hasAttribute(ViewportMeta.#ownAttr)) meta.remove();
        else if (meta.hasAttribute(ViewportMeta.#viewportAttr)) ViewportMeta.#mute(meta);
        else ViewportMeta.#unmute(meta);
      }
      return ViewportMeta.#inEffect(
        authored.map((meta) => ({ content: meta.content, media: meta.getAttribute("media") })),
      );
    }
    const tags = runtime ? [{ content: runtime }] : ViewportMeta.themeColors(viewport, theme);
    if (!tags.length) {
      for (const meta of existing) if (meta.hasAttribute(ViewportMeta.#ownAttr)) meta.remove();
      return null;
    }
    const inEffect = ViewportMeta.#inEffect(tags);
    const live = existing.filter((meta) => meta.getAttribute("media") !== ViewportMeta.#offMedia);
    const isCurrent =
      live.length === tags.length &&
      tags.every(
        (tag, idx) => live[idx]?.content === tag.content && live[idx]?.getAttribute("media") === (tag.media ?? null),
      );
    if (isCurrent) return inEffect;
    //? iOS repaints the status bar for a new meta, not a changed `content`; React's own metas must stay attached.
    for (const meta of existing) {
      if (meta.hasAttribute(ViewportMeta.#ownAttr)) meta.remove();
      else ViewportMeta.#mute(meta);
    }
    for (const tag of tags) {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = tag.content;
      if (tag.media) meta.setAttribute("media", tag.media);
      meta.setAttribute(ViewportMeta.#ownAttr, "");
      document.head.appendChild(meta);
    }
    return inEffect;
  }

  static #inEffect(tags: { content: string; media?: string | null }[]): string | null {
    return tags.find((tag) => !tag.media || window.matchMedia(tag.media).matches)?.content ?? null;
  }

  static #mute(meta: HTMLMetaElement) {
    //? Setting an attribute to the value it holds still wakes watchThemeColor's observer, which would apply again.
    if (meta.getAttribute("media") === ViewportMeta.#offMedia) return;
    if (!meta.hasAttribute(ViewportMeta.#mutedAttr))
      meta.setAttribute(ViewportMeta.#mutedAttr, meta.getAttribute("media") ?? "");
    meta.setAttribute("media", ViewportMeta.#offMedia);
  }

  static #unmute(meta: HTMLMetaElement) {
    const media = meta.getAttribute(ViewportMeta.#mutedAttr);
    if (media === null) return;
    if (media) meta.setAttribute("media", media);
    else meta.removeAttribute("media");
    meta.removeAttribute(ViewportMeta.#mutedAttr);
  }

  //? A stylesheet edit fires nothing, so the variable is read again when what selects it changes, the OS scheme included.
  static watchThemeColor(apply: () => void): () => void {
    let frame = 0;
    const schedule = () => {
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });
    const headObserver = new MutationObserver(schedule);
    headObserver.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["content", "media", "name"],
    });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", schedule);
    return () => {
      observer.disconnect();
      headObserver.disconnect();
      scheme.removeEventListener("change", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }

  static #ensureMeta(name: string): HTMLMetaElement {
    const found = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (found) return found;
    const meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
    return meta;
  }
}

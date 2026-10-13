import type { RouteViewport } from "./csrTypes";

export interface ThemeColorTag {
  content: string;
  media?: string;
}

/** Turns a root layout's `.viewport()` into the `viewport` and `theme-color` meta tags every document shell writes. */
export class ViewportMeta {
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

  static applyContent(viewport: RouteViewport | undefined, { native = false }: { native?: boolean } = {}) {
    const meta = ViewportMeta.#ensureMeta("viewport");
    const content = ViewportMeta.content(viewport, { native });
    if (meta.content !== content) meta.content = content;
  }

  static applyThemeColor(viewport: RouteViewport | undefined, theme?: string) {
    const tags = ViewportMeta.themeColors(viewport, theme);
    if (!tags.length) return;
    const existing = [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    //? React removes the metas a document rendered itself and throws on one detached here, so a spare one is switched
    //? off with a media query nothing matches instead.
    for (const meta of existing.slice(tags.length)) meta.setAttribute("media", "not all");
    tags.forEach((tag, idx) => {
      const meta = existing[idx] ?? ViewportMeta.#ensureMeta("theme-color", true);
      meta.content = tag.content;
      if (tag.media) meta.setAttribute("media", tag.media);
      else meta.removeAttribute("media");
    });
  }

  static #ensureMeta(name: string, fresh = false): HTMLMetaElement {
    const found = fresh ? null : document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (found) return found;
    const meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
    return meta;
  }
}

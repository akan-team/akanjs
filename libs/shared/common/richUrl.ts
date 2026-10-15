export type EmbedProvider = "youtube" | "vimeo";

export interface ResolvedEmbed {
  type: EmbedProvider;
  embedUrl: string;
}

/**
 * Which urls a stored node may carry, sink by sink. A document arrives from an agent, a script or a peer as
 * well as from the editor, so each check runs where it is saved and again where it is drawn.
 *
 * Every check parses with the WHATWG parser rather than matching a prefix: it is what the browser does
 * with the value, so `java\tscript:`, a leading space and `/\host` read here exactly as they will there.
 */
export class RichUrl {
  static readonly embedProviders: readonly EmbedProvider[] = ["youtube", "vimeo"];
  // A host no page is served from: a relative url resolves to it, and anything that resolves elsewhere is foreign.
  static readonly #base = "https://akan.invalid";
  static readonly #linkSchemes: ReadonlySet<string> = new Set(["http:", "https:", "mailto:", "tel:"]);
  static readonly #webSchemes: ReadonlySet<string> = new Set(["http:", "https:"]);
  static readonly #youtubeId = /^[\w-]{11}$/;
  static readonly #vimeoId = /^\d+$/;

  /** An absolute http(s) url, normalized; null for anything else. */
  static external(url: unknown): string | null {
    const parsed = RichUrl.#parse(url);
    return parsed && !RichUrl.#isRelative(parsed) && RichUrl.#webSchemes.has(parsed.protocol)
      ? parsed.toString()
      : null;
  }

  /** A link target: http(s), mailto, tel, or a path, query or anchor on this site. */
  static link(url: unknown): string | null {
    const parsed = RichUrl.#parse(url);
    if (!parsed) return null;
    return RichUrl.#isRelative(parsed) || RichUrl.#linkSchemes.has(parsed.protocol) ? String(url).trim() : null;
  }

  /** A link a person typed or pasted: http(s), normalized, or mailto/tel. A bare word is no link here. */
  static typedLink(url: unknown): string | null {
    const parsed = RichUrl.#parse(url);
    if (!parsed || RichUrl.#isRelative(parsed) || !RichUrl.#linkSchemes.has(parsed.protocol)) return null;
    return RichUrl.#webSchemes.has(parsed.protocol) ? parsed.toString() : String(url).trim();
  }

  /** A media source: an http(s) url, or a path on this site. */
  static media(url: unknown): string | null {
    const parsed = RichUrl.#parse(url);
    if (!parsed) return null;
    if (RichUrl.#isRelative(parsed)) return RichUrl.internalPath(url);
    return RichUrl.#webSchemes.has(parsed.protocol) ? String(url).trim() : null;
  }

  /** A path on this site: `/user/u1`, never `//host` or `/\host`, which a browser resolves to another origin. */
  static internalPath(url: unknown): string | null {
    const parsed = RichUrl.#parse(url);
    const path = String(url).trim();
    return parsed && RichUrl.#isRelative(parsed) && path.startsWith("/") ? path : null;
  }

  /** The player url of a supported video page, or null when it is no such page or its provider is not allowed. */
  static embed(url: unknown, providers: readonly string[] = RichUrl.embedProviders): ResolvedEmbed | null {
    const parsed = RichUrl.#parse(url);
    if (!parsed || RichUrl.#isRelative(parsed) || !RichUrl.#webSchemes.has(parsed.protocol)) return null;
    const host = parsed.hostname.replace(/^www\./, "");
    if (providers.includes("youtube")) {
      const id = RichUrl.#youtubeIdOf(host, parsed);
      if (id && RichUrl.#youtubeId.test(id))
        return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
    }
    if (providers.includes("vimeo") && RichUrl.#isHost(host, "vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      if (id && RichUrl.#vimeoId.test(id)) return { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
    }
    return null;
  }

  static #youtubeIdOf(host: string, url: URL) {
    if (host === "youtu.be") return url.pathname.slice(1);
    if (!RichUrl.#isHost(host, "youtube.com")) return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const [, kind, id] = url.pathname.split("/");
    return kind === "embed" || kind === "shorts" ? (id ?? null) : null;
  }

  static #isHost(host: string, domain: string) {
    return host === domain || host.endsWith(`.${domain}`);
  }

  static #isRelative(url: URL) {
    return url.origin === RichUrl.#base;
  }

  static #parse(url: unknown) {
    if (typeof url !== "string" || !url.trim()) return null;
    try {
      return new URL(url, RichUrl.#base);
    } catch {
      return null;
    }
  }
}

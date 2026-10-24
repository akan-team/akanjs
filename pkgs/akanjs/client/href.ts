export class Href {
  static readonly #blocked = new Set(["javascript:", "vbscript:", "data:"]);

  static #parse(href: string, base?: string): URL | null {
    try {
      return new URL(href, base);
    } catch {
      return null;
    }
  }

  /** External is what the browser takes off-site: any absolute URL with a scheme, and `//`/`\\` network-path
   * forms that name a host. javascript:, vbscript: and data: never count. */
  static isExternal(href: string): boolean {
    // An absolute URL with a scheme; the parser strips surrounding whitespace and tabs itself.
    const absolute = Href.#parse(href);
    if (absolute) return !Href.#blocked.has(absolute.protocol);
    // Network-path syntax: a browser reads // and \\ alike as another host, and only a host makes it external.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: mirrors the URL parser, which trims leading C0 controls and spaces
    const value = href.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+/, "");
    return /^[\\/]{2}/.test(value) && !!Href.#parse(value, "https://localhost")?.hostname;
  }

  /** An explicit http(s) scheme in any case; `//host` and `httpbin/x` do not qualify. */
  static hasWebScheme(href: string): boolean {
    return /^https?:/i.test(href);
  }

  /** Whether an http(s) href resolves, against `base`, to another origin than `base`'s. Any other href stays a path in
   * the app; no base, as outside a request, leaves for anywhere. */
  static leavesOrigin(href: string, base: string | undefined): boolean {
    if (!Href.hasWebScheme(href)) return false;
    const origin = base === undefined ? undefined : Href.#parse(base)?.origin;
    return !origin || Href.#parse(href, base)?.origin !== origin;
  }

  /** Canonical absolute URL for an external href: follows the browser on an http(s) document base; on a native
   * `app://` base an absolute URL resolves as written and a network path resolves against https:. */
  static toExternalUrl(href: string, base: string): string {
    const baseUrl = Href.#parse(base);
    if (baseUrl && /^https?:$/.test(baseUrl.protocol)) return Href.#parse(href, baseUrl.href)?.href ?? href;
    return (Href.#parse(href) ?? Href.#parse(href, "https://localhost"))?.href ?? href;
  }
}

declare global {
  var __AKAN_CSR_LOCATION__: CsrLocation | undefined;
  // Set by the HTML an MCP host renders, before the bundle runs; `account` is the caller's claims, never its token.
  var __AKAN_EMBED__: { kind: "mcp-app"; origin?: string; account?: Record<string, unknown> | null } | undefined;
}

/** The document's location and history, as the CSR router reads and moves them. */
export class CsrLocation {
  //? An MCP App view's document sits at its host's sandbox address, so it reads the screen it draws instead.
  #view: URL | null = null;

  /** Reads `href`, a path on the app's origin, as this document's location from now on; a view never moves. */
  view(href: string) {
    this.#view = new URL(href, "http://view.invalid");
  }

  /** Path, search and hash, without the origin. */
  get href() {
    return `${this.pathname}${this.search}${this.hash}`;
  }

  get pathname() {
    return (this.#view ?? window.location).pathname;
  }

  get search() {
    return (this.#view ?? window.location).search;
  }

  get hash() {
    return (this.#view ?? window.location).hash;
  }

  get state(): unknown {
    return window.history.state;
  }

  /** `href` as a route reads it: an absolute URL on this document's origin loses the origin, anything else is kept. */
  strip(href: string) {
    const origin = window.location.origin;
    return origin !== "null" && href.startsWith(origin) ? href.slice(origin.length) : href;
  }

  push(state: unknown, href: string) {
    window.history.pushState(state, "", href);
  }

  replace(state: unknown, href?: string) {
    if (href === undefined) window.history.replaceState(state, "");
    else window.history.replaceState(state, "", href);
  }

  back() {
    window.history.back();
  }

  assign(href: string) {
    window.location.assign(href);
  }

  reload() {
    window.location.reload();
  }
}

//? Interned: akan builds inline this module into several client bundles, and they must share one address.
globalThis.__AKAN_CSR_LOCATION__ ??= new CsrLocation();
export const csrLocation: CsrLocation = globalThis.__AKAN_CSR_LOCATION__;

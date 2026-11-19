declare global {
  var __AKAN_CSR_LOCATION__: CsrLocation | undefined;
  // Set by the HTML an MCP host renders, before the bundle runs; `account` is the caller's claims, never its token.
  var __AKAN_EMBED__: { kind: "mcp-app"; origin?: string; account?: Record<string, unknown> | null } | undefined;
}

/** The document's location and history, as the routers read and move them. */
export class CsrLocation {
  //? An MCP App view's document sits at its host's sandbox address, so it reads the screen it draws instead.
  #view: URL | null = null;
  #entry: { idx: number | undefined; href: string; from: string | undefined } | null = null;
  #onBack: ((idx: number) => void) | null = null;
  #backAsked: object | null = null;
  #backSent: object | null = null;

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

  /**
   * The entry on screen as of the last write or traversal, its index, and `from`, the address a push stacked it on
   * (none for an entry a document load or a fragment link made); during a `popstate` it is still the entry left,
   * which `state` no longer reads.
   */
  entry() {
    return this.#entry ?? this.observe();
  }

  observe() {
    const state = window.history?.state;
    this.#entry = { idx: CsrLocation.idxOf(state), href: this.href, from: CsrLocation.#fromOf(state) };
    return this.#entry;
  }

  //? Every write is stamped, so a popstate can tell how many entries it moved and a refused one can be undone.
  push(state: unknown, href: string) {
    const stacked = CsrLocation.#indexed(state, (this.entry().idx ?? 0) + 1) as { __akanRouter?: object };
    window.history.pushState({ ...stacked, __akanRouter: { ...stacked.__akanRouter, from: this.href } }, "", href);
    this.observe();
  }

  replace(state: unknown, href?: string) {
    const indexed = CsrLocation.#rewritten(CsrLocation.#indexed(state, this.entry().idx ?? 0), window.history.state);
    if (href === undefined) window.history.replaceState(indexed, "");
    else window.history.replaceState(indexed, "", href);
    this.observe();
  }

  static idxOf(state: unknown) {
    const idx = (state as { __akanRouter?: { idx?: unknown } } | null)?.__akanRouter?.idx;
    return Number.isInteger(idx) ? (idx as number) : undefined;
  }

  static #fromOf(state: unknown) {
    const from = (state as { __akanRouter?: { from?: unknown } } | null)?.__akanRouter?.from;
    return typeof from === "string" ? from : undefined;
  }

  //? A replace hands over a state of its own, and the entry it rewrites still sits on the address it was pushed from.
  static #rewritten(state: unknown, live: unknown) {
    const from = CsrLocation.#fromOf(live);
    if (from === undefined || CsrLocation.#fromOf(state) !== undefined) return state;
    const record = (state ?? {}) as { __akanRouter?: object };
    return { ...record, __akanRouter: { ...record.__akanRouter, from } };
  }

  static #indexed(state: unknown, idx: number) {
    if (CsrLocation.idxOf(state) !== undefined) return state;
    const record = (state ?? {}) as { __akanRouter?: object };
    return { ...record, __akanRouter: { ...record.__akanRouter, idx } };
  }

  /** Hears each `back()` as it moves, with the index of the entry it lands on; one listener, the router's. */
  onBack(listener: (idx: number) => void) {
    this.#onBack = listener;
  }

  /** Holds the entry on screen as left until `moving`, a shell's back, settles; `back()` holds it until the pop lands. */
  leaving(moving: unknown) {
    const entry = this.entry();
    this.#backAsked = entry;
    const release = () => {
      if (this.#backAsked === entry) this.#backAsked = null;
    };
    void Promise.resolve(moving).then(release, release);
  }

  /** Whether a back has left the entry on screen and not landed yet. */
  isLeaving() {
    const entry = this.entry();
    return entry === this.#backAsked || entry === this.#backSent;
  }

  back() {
    const entry = this.entry();
    if (entry.idx !== undefined) this.#onBack?.(entry.idx - 1);
    //? With no entry of this document under it a back may move nothing and send no pop, which would hold it for good.
    if (entry.idx !== undefined && entry.idx > 0) this.#backSent = entry;
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

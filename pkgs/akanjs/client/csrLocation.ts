interface CsrLocationEntry {
  href: string;
  state: unknown;
}

export interface CsrMemoryOwner {
  leave: (href: string) => void;
  reload: () => void;
}

declare global {
  var __AKAN_CSR_LOCATION__: CsrLocation | undefined;
  // Set by the HTML an MCP host renders, before the bundle runs; `account` is the caller's claims, never its token.
  var __AKAN_EMBED__: { kind: "mcp-app"; origin?: string; account?: Record<string, unknown> | null } | undefined;
}

// A view an MCP host renders runs in `about:srcdoc` (or a sandbox proxy's URL), where `pushState` to a route path
// throws, so it keeps the stack in memory and fires the same `popstate` the router already listens for.
export class CsrLocation {
  #memory: { entries: CsrLocationEntry[]; idx: number } | null = null;
  #owner: CsrMemoryOwner = { leave: () => undefined, reload: () => undefined };

  get isMemory() {
    return this.#memory !== null;
  }

  /** The owner takes what a document load would do, which a view cannot: it has no document to load in its place. */
  useMemory(href: string, owner: CsrMemoryOwner) {
    this.#memory = { entries: [{ href, state: null }], idx: 0 };
    this.#owner = owner;
  }

  /** Path, search and hash, without the origin. */
  get href() {
    const entry = this.#entry();
    if (entry) return entry.href;
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  get pathname() {
    if (!this.#memory) return window.location.pathname;
    return this.href.split(/[?#]/)[0] ?? "/";
  }

  get search() {
    if (!this.#memory) return window.location.search;
    const [beforeHash] = this.href.split("#");
    const at = beforeHash?.indexOf("?") ?? -1;
    return at >= 0 ? (beforeHash?.slice(at) ?? "") : "";
  }

  get hash() {
    if (!this.#memory) return window.location.hash;
    const at = this.href.indexOf("#");
    return at >= 0 ? this.href.slice(at) : "";
  }

  get state(): unknown {
    const entry = this.#entry();
    return entry ? entry.state : window.history.state;
  }

  /** `href` as a route reads it: an absolute URL on this document's origin loses the origin, anything else is kept. */
  strip(href: string) {
    if (this.#memory) return href;
    const origin = window.location.origin;
    return origin !== "null" && href.startsWith(origin) ? href.slice(origin.length) : href;
  }

  push(state: unknown, href: string) {
    const memory = this.#memory;
    if (!memory) {
      window.history.pushState(state, "", href);
      return;
    }
    memory.entries = [...memory.entries.slice(0, memory.idx + 1), { href, state }];
    memory.idx = memory.entries.length - 1;
  }

  replace(state: unknown, href?: string) {
    const memory = this.#memory;
    if (!memory) {
      if (href === undefined) window.history.replaceState(state, "");
      else window.history.replaceState(state, "", href);
      return;
    }
    const current = memory.entries[memory.idx];
    memory.entries[memory.idx] = { href: href ?? current?.href ?? "/", state };
  }

  back() {
    const memory = this.#memory;
    if (!memory) {
      window.history.back();
      return;
    }
    if (memory.idx === 0) return;
    memory.idx -= 1;
    const state = memory.entries[memory.idx]?.state ?? null;
    //? Async like the browser's own: the router settles its stack before the event it reacts to.
    setTimeout(() => window.dispatchEvent(new PopStateEvent("popstate", { state })), 0);
  }

  assign(href: string) {
    if (!this.#memory) {
      window.location.assign(href);
      return;
    }
    this.#owner.leave(href);
  }

  reload() {
    if (!this.#memory) window.location.reload();
    else this.#owner.reload();
  }

  #entry() {
    const memory = this.#memory;
    return memory ? memory.entries[memory.idx] : undefined;
  }
}

//? Interned: akan builds inline this module into several client bundles, and they must share one address.
globalThis.__AKAN_CSR_LOCATION__ ??= new CsrLocation();
export const csrLocation: CsrLocation = globalThis.__AKAN_CSR_LOCATION__;

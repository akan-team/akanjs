const RESTORE_WINDOW_MS = 2000;
const PERSIST_DELAY_MS = 200;
const userScrollEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

interface AkanEntryState {
  key?: unknown;
  scrollY?: unknown;
}

// The browser restores after `popstate`, so an engine that kept a stale offset for a pushed entry (WebKit saves none
// once the page has loaded) or skips the step after a user scroll leaves a shorter page clamped to its bottom.
export class RscScrollRestoration {
  #positions = new Map<string, number>();
  #key: string;
  #manual: boolean = false;
  #persistTimer: ReturnType<typeof setTimeout> | null = null;
  #cancelPending: (() => void) | null = null;

  constructor() {
    this.#key = RscScrollRestoration.#entryOf(window.history.state).key ?? RscScrollRestoration.#mintKey();
    //? The browser restores no manual entry, so a reload or a document load back into one reads the offset from its state.
    window.addEventListener("scroll", () => this.#schedulePersist(), { passive: true });
    window.addEventListener("pagehide", () => {
      if (this.#persistTimer) this.#persist();
    });
  }

  pushEntry(): { key: string } {
    this.#settle();
    this.#manual = true;
    window.history.scrollRestoration = "manual";
    this.#positions.set(this.#key, window.scrollY);
    this.#persist();
    this.#key = RscScrollRestoration.#mintKey();
    return { key: this.#key };
  }

  replaceEntry(): { key: string; scrollY?: number } {
    const { scrollY } = RscScrollRestoration.#entryOf(window.history.state);
    return { key: this.#key, ...(scrollY === undefined ? {} : { scrollY }) };
  }

  traverseTo(state: unknown): number | undefined {
    this.#settle();
    this.#positions.set(this.#key, window.scrollY);
    const entry = RscScrollRestoration.#entryOf(state);
    if (entry.key) {
      this.#key = entry.key;
      return this.#positions.get(entry.key) ?? entry.scrollY;
    }
    //? A fragment link pushes an entry with no state; keyed now, a later move back to it restores.
    this.#key = RscScrollRestoration.#mintKey();
    RscScrollRestoration.#writeEntry({ key: this.#key });
    return undefined;
  }

  scrollTo(scrollY: number) {
    this.#cancelPending?.();
    window.scrollTo(0, scrollY);
    if (scrollY === 0 || typeof ResizeObserver === "undefined") return;
    //? Images and streamed sections size themselves after the commit, and scroll anchoring would carry the offset along.
    const observer = new ResizeObserver(() => {
      if (Math.abs(window.scrollY - scrollY) > 1) window.scrollTo(0, scrollY);
    });
    const timer = setTimeout(() => cancel(), RESTORE_WINDOW_MS);
    const cancel = () => {
      observer.disconnect();
      clearTimeout(timer);
      for (const type of userScrollEvents) window.removeEventListener(type, cancel, true);
      if (this.#cancelPending === cancel) this.#cancelPending = null;
    };
    for (const type of userScrollEvents) window.addEventListener(type, cancel, { capture: true, passive: true });
    observer.observe(document.body);
    this.#cancelPending = cancel;
  }

  restoreDocumentLoad() {
    if (window.history.scrollRestoration !== "manual") return;
    this.#manual = true;
    const { scrollY } = RscScrollRestoration.#entryOf(window.history.state);
    if (scrollY !== undefined) this.scrollTo(scrollY);
  }

  #schedulePersist() {
    if (!this.#manual) return;
    if (this.#persistTimer) clearTimeout(this.#persistTimer);
    this.#persistTimer = setTimeout(() => this.#persist(), PERSIST_DELAY_MS);
  }

  #persist() {
    if (this.#persistTimer) clearTimeout(this.#persistTimer);
    this.#persistTimer = null;
    RscScrollRestoration.#writeEntry({ key: this.#key, scrollY: window.scrollY });
  }

  #settle() {
    this.#cancelPending?.();
    if (this.#persistTimer) clearTimeout(this.#persistTimer);
    this.#persistTimer = null;
  }

  static #entryOf(state: unknown): { key?: string; scrollY?: number } {
    const entry = (state as { __akanRouter?: AkanEntryState } | null)?.__akanRouter;
    return {
      key: typeof entry?.key === "string" ? entry.key : undefined,
      scrollY: typeof entry?.scrollY === "number" && Number.isFinite(entry.scrollY) ? entry.scrollY : undefined,
    };
  }

  static #writeEntry(fields: AkanEntryState) {
    const state = (window.history.state ?? {}) as { __akanRouter?: object };
    window.history.replaceState({ ...state, __akanRouter: { ...state.__akanRouter, ...fields } }, "");
  }

  static #mintKey() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

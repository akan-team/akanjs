const RESTORE_WINDOW_MS = 2000;
const PERSIST_DELAY_MS = 200;
const userScrollEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

interface AkanEntryState {
  key?: unknown;
  idx?: unknown;
  scrollY?: unknown;
}

// The browser restores after `popstate`, so an engine that kept a stale offset for a pushed entry (WebKit saves none
// once the page has loaded) or skips the step after a user scroll leaves a shorter page clamped to its bottom.
export class RscScrollRestoration {
  #positions = new Map<string, number>();
  #key: string;
  #idx: number;
  #manual: boolean = false;
  #persistTimer: ReturnType<typeof setTimeout> | null = null;
  #cancelPending: (() => void) | null = null;

  constructor() {
    const entry = RscScrollRestoration.#entryOf(window.history.state);
    this.#key = entry.key ?? RscScrollRestoration.#mintKey();
    this.#idx = entry.idx ?? 0;
    //? The browser restores no manual entry, so a reload or a document load back into one reads the offset from its state.
    window.addEventListener("scroll", () => this.#schedulePersist(), { passive: true });
    window.addEventListener("pagehide", () => {
      if (this.#persistTimer) this.#persist();
    });
  }

  //? `router.canGoBack()` reads the index off the entry, so a push records one step past the entry it leaves.
  pushEntry(): { key: string; idx: number } {
    this.#settle();
    this.#manual = true;
    window.history.scrollRestoration = "manual";
    this.#positions.set(this.#key, window.scrollY);
    this.#persist();
    this.#key = RscScrollRestoration.#mintKey();
    this.#idx = this.#liveIdx() + 1;
    return { key: this.#key, idx: this.#idx };
  }

  replaceEntry(): { key: string; idx: number; scrollY?: number } {
    const { scrollY } = RscScrollRestoration.#entryOf(window.history.state);
    this.#idx = this.#liveIdx();
    return { key: this.#key, idx: this.#idx, ...(scrollY === undefined ? {} : { scrollY }) };
  }

  traverseTo(state: unknown): number | undefined {
    this.#settle();
    this.#positions.set(this.#key, window.scrollY);
    const entry = RscScrollRestoration.#entryOf(state);
    if (entry.key) {
      this.#key = entry.key;
      this.#idx = entry.idx ?? 0;
      return this.#positions.get(entry.key) ?? entry.scrollY;
    }
    //? A fragment link pushes an entry with no state, one step past the entry it left, and the entry a document opened
    //? on holds only the index the router stamped; keyed now, a later move back to either restores.
    this.#key = RscScrollRestoration.#mintKey();
    this.#idx = entry.idx ?? this.#idx + 1;
    RscScrollRestoration.#writeEntry({ key: this.#key, idx: this.#idx });
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

  #liveIdx(): number {
    return RscScrollRestoration.#entryOf(window.history.state).idx ?? this.#idx;
  }

  #settle() {
    this.#cancelPending?.();
    if (this.#persistTimer) clearTimeout(this.#persistTimer);
    this.#persistTimer = null;
  }

  static #entryOf(state: unknown): { key?: string; idx?: number; scrollY?: number } {
    const entry = (state as { __akanRouter?: AkanEntryState } | null)?.__akanRouter;
    return {
      key: typeof entry?.key === "string" ? entry.key : undefined,
      idx: Number.isInteger(entry?.idx) ? (entry?.idx as number) : undefined,
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

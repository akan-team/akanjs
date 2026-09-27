// Host side of a cancelable page event (window closeRequested, app beforeQuit; plugins.md D4).
//
// The plugin's event source hands its emit to `source`; `ask` emits { id, ...data } to the pages
// that listen (all of them, or one window) and waits for them. Each page answers through a plugin
// method (`answer`): first { id } when the event arrived, then { id, allow } after its handlers
// ran. Every page must allow; nobody listening = allowed. A page that does not confirm within
// `ackTimeout` (hung, or never loaded) counts as allowing, so it cannot keep the app from
// quitting; after the confirmation the page may take as long as it likes (a dialog).
// If a page that was asked goes away meanwhile (reload, window destroyed), the request is
// dropped: the app keeps running, the window stays open.

import { AkanNativeError } from "../../core/src/index.ts";
import type { DesktopContext, EmitTarget } from "./plugin.ts";

export const PAGE_ACK_TIMEOUT = 2000;

/** Emit functions from before multi-window return nothing: one page, answering from any window. */
const ANY_PAGE = -1;

export interface PageVeto<D> {
  readonly listening: boolean;
  /**
   * The plugin's event source: `events: { closeRequested: (emit, ctx) => veto.source(emit, ctx) }`.
   * With `ctx`, a page that reloads or whose window is destroyed while asked drops the request.
   */
  source(emit: (data: D & { id: number }, target?: EmitTarget) => number[] | unknown, ctx?: DesktopContext): () => void;
  /** Resolves false if a page called preventDefault(). */
  ask(data: D, target?: EmitTarget): Promise<boolean>;
  /** The plugin method the pages answer with: { id, allow? }, from `window` (ctx.window). */
  answer(args: unknown, window?: number): void;
}

interface Pending {
  /** Asked pages that have not allowed yet: window → acknowledged. */
  pages: Map<number, boolean>;
  timer: ReturnType<typeof setTimeout> | undefined;
  resolve(allow: boolean): void;
}

export function createPageVeto<D extends object = {}>(ackTimeout = PAGE_ACK_TIMEOUT): PageVeto<D> {
  let emit: ((data: D & { id: number }, target?: EmitTarget) => number[] | unknown) | null = null;
  let seq = 0;
  const pending = new Map<number, Pending>();

  const settle = (id: number, allow: boolean) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve(allow);
  };
  const gone = (window: number) => {
    for (const [id, entry] of [...pending]) if (entry.pages.has(window)) settle(id, false);
  };

  return {
    get listening() {
      return emit !== null;
    },
    source(send, ctx) {
      emit = send;
      // The asked page's document ended (reload, navigation, window destroyed, renderer gone):
      // the host settles the wait at once instead of waiting for an answer that cannot come.
      const stops = ctx ? [ctx.onDocumentEnd((doc) => gone(doc.window))] : [];
      return () => {
        for (const stop of stops) stop();
        if (emit === send) emit = null;
        for (const id of [...pending.keys()]) settle(id, false);
      };
    },
    ask(data, target) {
      if (!emit) return Promise.resolve(true);
      const id = ++seq;
      return new Promise<boolean>((resolve) => {
        const entry: Pending = { pages: new Map(), timer: undefined, resolve };
        pending.set(id, entry);
        const reached = emit!({ ...data, id }, target);
        const windows = Array.isArray(reached) ? (reached as number[]) : [ANY_PAGE];
        if (windows.length === 0) return settle(id, true); // nobody listens there
        for (const window of windows) entry.pages.set(window, false);
        entry.timer = setTimeout(() => {
          for (const [window, acked] of entry.pages) {
            if (acked) continue;
            console.warn(
              `[akan-native] the page${window > 0 ? ` of window ${window}` : ""} did not answer within ${ackTimeout} ms; going on`,
            );
            entry.pages.delete(window);
          }
          if (entry.pages.size === 0) settle(id, true);
        }, ackTimeout);
      });
    },
    answer(args, window) {
      const { id, allow } = (args ?? {}) as { id?: unknown; allow?: unknown };
      if (typeof id !== "number") throw new AkanNativeError("INVALID_ARGS", "id must be a number");
      if (allow !== undefined && typeof allow !== "boolean")
        throw new AkanNativeError("INVALID_ARGS", "allow must be a boolean");
      const entry = pending.get(id);
      if (!entry) return; // answered late (timed out, or the page reloaded)
      const page =
        window !== undefined && entry.pages.has(window) ? window : entry.pages.has(ANY_PAGE) ? ANY_PAGE : undefined;
      if (page === undefined) return; // not asked (another window), or counted as allowing already
      if (allow === undefined) {
        entry.pages.set(page, true); // received: this page decides now
        if ([...entry.pages.values()].every(Boolean)) clearTimeout(entry.timer);
      } else if (!allow) settle(id, false);
      else {
        entry.pages.delete(page);
        if (entry.pages.size === 0) settle(id, true);
      }
    },
  };
}

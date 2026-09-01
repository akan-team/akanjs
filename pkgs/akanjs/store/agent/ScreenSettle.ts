export interface ScreenSettleOptions {
  /** How long the DOM must hold still before the screen counts as settled. */
  quietMs?: number;
  /** How long to wait for a change that has not started yet — a navigation whose payload is still in flight. */
  appearMs?: number;
  timeoutMs?: number;
}

/**
 * Waits until the screen stops changing.
 *
 * The surface is read synchronously and the app is not: `router.push` returns while the RSC payload for the new
 * route is still in flight, and a store action that fires `void fetch.*` commits a tick later. A tool that returns
 * at either of those moments reports the screen it replaced — and the `readScreen` the agent calls next reads the
 * page the user already left.
 *
 * Quiescence rather than a framework signal, because there is no one signal: the client router hands its promise
 * to nobody, and a change may land in the store, in a refetch, or in a streamed Suspense boundary. A
 * MutationObserver sees all three, and every wait is bounded — a screen that never holds still still answers.
 */
export class ScreenSettle {
  static wait({ quietMs = 120, appearMs = 0, timeoutMs = 3000 }: ScreenSettleOptions = {}): Promise<void> {
    const body = typeof document === "undefined" ? null : (document.body ?? document.documentElement);
    if (!body || typeof MutationObserver === "undefined") return Promise.resolve();
    return new Promise((resolve) => {
      let quiet: ReturnType<typeof setTimeout> | null = null;
      const done = () => {
        if (quiet) clearTimeout(quiet);
        clearTimeout(deadline);
        observer.disconnect();
        resolve();
      };
      const rearm = () => {
        if (quiet) clearTimeout(quiet);
        quiet = setTimeout(done, quietMs);
      };
      const observer = new MutationObserver(rearm);
      const deadline = setTimeout(done, timeoutMs);
      observer.observe(body, { attributes: true, characterData: true, childList: true, subtree: true });
      // Until the first mutation arrives there is nothing to be quiet about, so an `appearMs` wait gives the
      // change that long to start and gives up rather than reporting a screen that never moved.
      if (appearMs) quiet = setTimeout(done, appearMs);
      else rearm();
    });
  }
}

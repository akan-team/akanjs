import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import { checkColor, checkUrl } from "./args.ts";
import type { BrowserApi, BrowserEvents } from "./index.ts";

// Web: a new window (capacitor-plugins/browser/src/web.ts keeps the handle for close() the same way).
// - open() stays synchronous up to window.open, so it runs inside the click's user activation.
// - Not "noopener": with it window.open returns null, a blocked popup could not be told apart and
//   close() would have nothing to close. The opener is cleared right after instead (what noopener does).
// - finished: `closed` is readable across origins; it is polled while a window is open, since
//   no event reaches the opener when the user closes it.

const POLL_MS = 500;

let current: Window | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let notify: (() => void) | null = null;

function stopPolling(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

export const web = defineWebPlugin<BrowserApi, BrowserEvents>({
  methods: {
    open(args) {
      const url = checkUrl(args?.url);
      checkColor(args?.toolbarColor); // validated like everywhere, a window has no toolbar color
      if (current && !current.closed)
        return Promise.reject(
          new AkanNativeError("INVALID_ARGS", "a browser window is already open; close() it first"),
        );
      const opened = window.open(url.href, "_blank");
      if (!opened)
        return Promise.reject(
          new AkanNativeError("PERMISSION_DENIED", "the browser blocked the new window (call open from a click)"),
        );
      try {
        opened.opener = null;
      } catch {
        // cross-origin already: nothing to clear
      }
      current = opened;
      stopPolling();
      timer = setInterval(() => {
        if (!current?.closed) return;
        current = null;
        stopPolling();
        notify?.();
      }, POLL_MS);
      return Promise.resolve();
    },
    async close() {
      const win = current;
      current = null;
      stopPolling();
      if (win && !win.closed) win.close();
    },
  },
  events: {
    finished(emit) {
      const mine = () => emit({});
      notify = mine;
      return () => {
        if (notify === mine) notify = null;
      };
    },
  },
});

import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { KeepAwakeApi } from "./index.ts";

// Screen Wake Lock API. The browser releases the lock whenever the page is hidden (tab switch,
// minimized window) and never re-acquires it by itself, so the lock is requested again on
// visibilitychange while keepAwake is wanted. request() rejects NotAllowedError while hidden or
// when the browser refuses (Permissions-Policy, battery saver) → PERMISSION_DENIED via AkanNativeError.from.
// keepAwake stays synchronous up to request() in case a browser wants the click's user activation.

interface Sentinel extends EventTarget {
  readonly released: boolean;
  release(): Promise<void>;
}

interface WakeLock {
  request(type: "screen"): Promise<Sentinel>;
}

let wanted = false;
let sentinel: Sentinel | null = null;
let pending: Promise<Sentinel> | null = null;

function wakeLock(): WakeLock | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
}

function request(lock: WakeLock): Promise<Sentinel> {
  if (sentinel && !sentinel.released) return Promise.resolve(sentinel);
  pending ??= lock.request("screen").then(
    (next) => {
      pending = null;
      if (!wanted) {
        void next.release(); // allowSleep() came first
        return next;
      }
      sentinel = next;
      return next;
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

function onVisibility(): void {
  const lock = wakeLock();
  if (!wanted || !lock || document.visibilityState !== "visible") return;
  request(lock).catch((error) => console.warn("[akan-native] keep-awake: could not re-acquire the wake lock", error));
}

export const web = defineWebPlugin<KeepAwakeApi>({
  methods: {
    keepAwake() {
      const lock = wakeLock();
      if (!lock)
        return Promise.reject(
          new AkanNativeError("UNSUPPORTED", "this browser has no Screen Wake Lock API (navigator.wakeLock)"),
        );
      const first = !wanted;
      wanted = true;
      if (first) document.addEventListener("visibilitychange", onVisibility);
      // Hidden now: the lock is taken when the page is shown again.
      if (document.visibilityState !== "visible") return Promise.resolve();
      return request(lock).then(
        () => undefined,
        (error: unknown) => {
          wanted = false;
          document.removeEventListener("visibilitychange", onVisibility);
          throw AkanNativeError.from(error);
        },
      );
    },
    async allowSleep() {
      if (wanted) document.removeEventListener("visibilitychange", onVisibility);
      wanted = false;
      const current = sentinel;
      sentinel = null;
      if (current && !current.released) await current.release();
    },
    isKeptAwake: async () => ({ value: wanted }),
  },
});

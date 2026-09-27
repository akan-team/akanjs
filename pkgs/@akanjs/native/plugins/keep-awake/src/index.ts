// A namespace import: under React Server Components (react-server) react has no hooks, and named
// imports of them would fail when this module is linked (docs/api.md, O2-3).
import * as React from "react";
import { definePlugin } from "../../../packages/core/src/index.ts";
import { web } from "./web.ts";

/**
 * Keeps the screen on (plugins.md §4.1). The state belongs to the page, like the web's Screen Wake
 * Lock (architecture review, 2026-09-26): a reload, a navigation or the window closing lets the
 * display sleep again on every platform. On the desktop each window's page holds its own request;
 * the display stays on while one holds it. Idempotent: calling keepAwake twice needs one allowSleep.
 */
export interface KeepAwakeApi {
  /**
   * Stops the display from dimming and sleeping while the app is in front. Rejects UNSUPPORTED
   * on browsers without the Screen Wake Lock API and on Linux sessions without an inhibit service
   * (xdg-desktop-portal or org.freedesktop.ScreenSaver, which GNOME and KDE provide), and
   * PERMISSION_DENIED when the browser refuses it (e.g. a Permissions-Policy, or low battery mode).
   */
  keepAwake(): Promise<void>;
  /** Lets the display sleep again. Always resolves, also when keepAwake was never called. */
  allowSleep(): Promise<void>;
  /**
   * Whether keepAwake is in effect. On the web it stays true while the page is hidden: the browser
   * releases the lock then and it is requested again when the page becomes visible.
   */
  isKeptAwake(): Promise<{ value: boolean }>;
}

export const keepAwake = definePlugin<KeepAwakeApi>("keep-awake", {
  methods: ["keepAwake", "allowSleep", "isKeptAwake"],
  web,
});

// Holders: the screen stays on while at least one holder wants it, so two components do not
// release each other's lock. The release waits one microtask so StrictMode's unmount/remount
// does not toggle the native flag; calls reach the host in order.
let holders = 0;
let held = false;
let queue: Promise<unknown> = Promise.resolve();

function sync(): void {
  const want = holders > 0;
  if (want === held) return;
  held = want;
  queue = queue
    .then(() => (want ? keepAwake.keepAwake() : keepAwake.allowSleep()))
    .catch((error) => console.warn(`[akan-native] keep-awake: ${want ? "keepAwake" : "allowSleep"} failed`, error));
}

/**
 * Keeps the screen on until the returned function is called (once per holder). The first holder
 * calls keepAwake, the last release calls allowSleep. Do not mix with direct keepAwake()/allowSleep()
 * calls: holders only know about each other. Resolves when the host has applied the change.
 */
export function holdKeepAwake(): () => Promise<void> {
  holders++;
  sync();
  let released = false;
  return () => {
    if (!released) {
      released = true;
      holders--;
      return new Promise<void>((resolve) =>
        queueMicrotask(() => {
          sync();
          void queue.then(() => resolve());
        }),
      );
    }
    return queue.then(() => undefined);
  };
}

/** Keeps the screen on while the component is mounted and `enabled` (a holder, see holdKeepAwake). */
export function useKeepAwake(enabled = true): void {
  React.useEffect(() => {
    if (!enabled) return;
    const release = holdKeepAwake();
    return () => void release();
  }, [enabled]);
}

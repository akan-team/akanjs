"use client";
import { debugFrame } from "akanjs/client";
import { appState, isAkanNativeError, isNativeApp, isNativeShell, updates } from "akanjs/client/native";

//* A release on trial is confirmed once the first page is on screen, in every native shell, since an unconfirmed trial
//* is rolled back at the next launch. A phone's web bundle also stays current on its own: a newer one is fetched in the
//* background at start and whenever the app comes back to the front, and runs from the next cold start;
//* `updates.apply()` is for a screen that offers it now. A desktop release is the whole app and a relaunch, so the app
//* checks, downloads and applies it on its own schedule.
export class NativeUpdates {
  static readonly recheckAfterMs = 10 * 60 * 1000;
  static #confirmed = false;
  #lastCheckAt = 0;
  #checking = false;

  //? A dev build loads its pages through the dev gateway, where a downloaded bundle would only shadow the edited one.
  static get #devBuild() {
    return !!(globalThis as { __AKAN_NATIVE_DEV__?: unknown }).__AKAN_NATIVE_DEV__;
  }

  static get enabled() {
    return isNativeApp() && updates.isSupported("check") && !NativeUpdates.#devBuild;
  }

  static confirm() {
    if (NativeUpdates.#confirmed || NativeUpdates.#devBuild) return;
    if (!isNativeShell() || !updates.isSupported("notifyReady")) return;
    NativeUpdates.#confirmed = true;
    void updates
      .notifyReady()
      .catch((error: unknown) => debugFrame("updates.notifyReady.failed", { error: String(error) }));
  }

  listen(): () => void {
    if (!NativeUpdates.enabled) return () => undefined;
    const first = window.setTimeout(() => void this.check(), 3_000);
    const stop = appState.listen("change", ({ state }) => {
      if (state === "active" && Date.now() - this.#lastCheckAt >= NativeUpdates.recheckAfterMs) void this.check();
    });
    return () => {
      window.clearTimeout(first);
      stop();
    };
  }

  async check() {
    if (this.#checking) return;
    this.#checking = true;
    this.#lastCheckAt = Date.now();
    try {
      const found = await updates.check();
      debugFrame("updates.check", { available: found.available, bundle: found.bundle });
      if (found.available) await updates.download();
    } catch (error) {
      //? NOT_FOUND is a channel nothing was published to yet, which is not a failure worth a line.
      if (!isAkanNativeError(error, "NOT_FOUND")) debugFrame("updates.check.failed", { error: String(error) });
    } finally {
      this.#checking = false;
    }
  }
}

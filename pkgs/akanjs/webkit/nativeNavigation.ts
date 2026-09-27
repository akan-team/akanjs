"use client";
import { router as clientRouter, debugFrame, normalizeDeepLinkHref } from "akanjs/client";
import { app, isNativeApp } from "akanjs/client/native";

export interface NativeBackState {
  path: string;
  keyboardHeight: number;
  keyboardVisible: boolean;
  router: { back: () => void };
}

interface NativeNavigationOptions {
  historyIdx: () => number;
  backState: () => NativeBackState;
  /** A back press while the keyboard is up only puts it away. */
  dismissKeyboard: () => unknown;
}

/** A native shell's deep links and Android back button, for the CSR frame that owns the history. */
export class NativeNavigation {
  #mountedAt = Date.now();
  #handled: { href: string; handledAt: number } | null = null;
  #didResetStack = false;

  constructor(readonly options: NativeNavigationOptions) {}

  listen() {
    if (!isNativeApp()) return () => undefined;
    const stops = [
      app.listen("urlOpen", ({ url }) => {
        this.openDeepLink(url);
      }),
      app.listen("backButton", () => {
        this.back();
      }),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }

  //? The runtime holds every link, the launch one included, until a listener takes it; the first one right after
  //? mount is the launch link, which starts a fresh stack.
  openDeepLink(url: string) {
    const href = normalizeDeepLinkHref(url);
    const now = Date.now();
    const lastHandled = this.#handled;
    const resetStack = !lastHandled && now - this.#mountedAt < 5000;
    if (lastHandled?.href === href && now - lastHandled.handledAt < 1000) return;
    this.#handled = { href, handledAt: now };
    debugFrame("native.deepLink", {
      href,
      resetStack,
      historyIdx: this.options.historyIdx(),
      mountedForMs: now - this.#mountedAt,
      routerReady: clientRouter.isInitialized,
    });
    if (resetStack) this.#didResetStack = true;
    this.#enterWhenReady(href, resetStack);
  }

  back() {
    const backState = this.options.backState();
    debugFrame("native.backButton", {
      historyIdx: this.options.historyIdx(),
      path: backState.path,
      keyboardHeight: backState.keyboardHeight,
    });
    if (backState.keyboardVisible) {
      void this.options.dismissKeyboard();
      return;
    }
    if (this.options.historyIdx() > 0) {
      backState.router.back();
      return;
    }
    const fallbackPath = window.__AKAN_MOBILE_TARGET__?.indexPath ?? "/";
    //? a stack a deep link started has nothing under it, so back leaves the app rather than inventing a history
    if (this.#didResetStack || backState.path === fallbackPath) {
      void app.exit().catch(() => undefined);
      return;
    }
    clientRouter.backOrFallback(fallbackPath, { scrollToTop: false });
  }

  #enterWhenReady(href: string, resetStack: boolean, attempt = 0) {
    if (!clientRouter.isInitialized) {
      if (attempt < 40) window.setTimeout(() => this.#enterWhenReady(href, resetStack, attempt + 1), 50);
      else debugFrame("native.deepLink.skipped", { href, reason: "router-not-ready" });
      return;
    }
    clientRouter.enterDeepLink(href, { resetStack, scrollToTop: true });
  }
}

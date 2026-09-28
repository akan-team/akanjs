"use client";
import { router as clientRouter, debugFrame, normalizeDeepLinkHref } from "akanjs/client";
import { app, desktopPlatform, isNativeApp, push } from "akanjs/client/native";

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

/** A native shell's deep links, push taps and Android back button, for the CSR frame that owns the history. */
export class NativeNavigation {
  #mountedAt = Date.now();
  #handled: { href: string; handledAt: number } | null = null;
  #didResetStack = false;

  constructor(readonly options: NativeNavigationOptions) {}

  listen() {
    //? WebView2 walks history on Alt+← and the mouse back button by itself; WKWebView leaves both to the app.
    if (desktopPlatform() === "macos") return this.#listenMacBack();
    if (!isNativeApp()) return () => undefined;
    //? The runtime hides a push that arrives with the app in front unless asked; shown, it can be tapped like any other.
    if (push.isSupported("setForegroundPresentation"))
      void push
        .setForegroundPresentation({ banner: true, list: true, sound: true, badge: true })
        .catch(() => undefined);
    const stops = [
      app.listen("urlOpen", ({ url }) => {
        this.openDeepLink(url);
      }),
      app.listen("backButton", () => {
        this.back();
      }),
      push.listen("action", ({ message }) => {
        this.openPushLink(message.data.url);
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

  //? Only an in-app path is followed: a push names a route, and an absolute URL would be read as one on any host.
  openPushLink(url: unknown) {
    if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) {
      debugFrame("native.pushLink.skipped", { url: typeof url === "string" ? url : null });
      return;
    }
    this.openDeepLink(url);
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
    if (this.#didResetStack || NativeNavigation.#homeRelative(backState.path) === fallbackPath) {
      void app.exit().catch(() => undefined);
      return;
    }
    clientRouter.backOrFallback(fallbackPath, { scrollToTop: false });
  }

  #listenMacBack() {
    const onKey = (event: KeyboardEvent) => {
      if (!NativeNavigation.isMacBackKey(event) || NativeNavigation.#isEditing(event.target)) return;
      event.preventDefault();
      this.options.backState().router.back();
    };
    const onMouse = (event: MouseEvent) => {
      if (event.button !== 3) return;
      event.preventDefault();
      this.options.backState().router.back();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouse);
    };
  }

  static isMacBackKey({
    key,
    metaKey,
    altKey,
    ctrlKey,
    shiftKey,
  }: Pick<KeyboardEvent, "key" | "metaKey" | "altKey" | "ctrlKey" | "shiftKey">) {
    return metaKey && !altKey && !ctrlKey && !shiftKey && (key === "[" || key === "ArrowLeft");
  }

  //? ⌘← moves the caret to the start of the line and ⌘[ outdents in an editor, so a field keeps both.
  static #isEditing(target: EventTarget | null) {
    return (
      target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    );
  }

  //* The frame reports its route pattern (`/:lang/<basePath>/…`); the target's indexPath is relative to the basePath.
  static #homeRelative(routePath: string) {
    const basePath = window.__AKAN_MOBILE_TARGET__?.basePath?.replace(/^\/+|\/+$/g, "");
    const segments = routePath.split("/").filter(Boolean);
    if (segments[0] === ":lang") segments.shift();
    if (basePath && segments[0] === basePath) segments.shift();
    return `/${segments.join("/")}`;
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

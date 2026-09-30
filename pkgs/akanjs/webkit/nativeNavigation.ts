"use client";
import { router as clientRouter, debugFrame, normalizeDeepLinkHref } from "akanjs/client";
import { app, appState, desktopPlatform, isNativeApp, push } from "akanjs/client/native";

export interface NativeBackState {
  path: string;
  keyboardHeight: number;
  keyboardVisible: boolean;
  router: { back: () => void };
}

export interface NativeBackProgress {
  phase: "started" | "progressed" | "cancelled";
  progress: number;
}

interface NativeNavigationOptions {
  historyIdx: () => number;
  backState: () => NativeBackState;
  /** A back press while the keyboard is up only puts it away. */
  dismissKeyboard: () => unknown;
  /** Android 14+: the swipe of a back this page will take, before it commits or is let go. */
  onBackProgress?: (progress: NativeBackProgress) => void;
  onMemoryWarning?: () => void;
}

/** A native shell's deep links, push taps and Android back button, for the CSR frame that owns the history. */
export class NativeNavigation {
  #mountedAt = Date.now();
  #handled: { href: string; handledAt: number } | null = null;
  #didResetStack = false;
  #backEnabled = true;

  constructor(readonly options: NativeNavigationOptions) {}

  //? A push that opens the page on screen is not shown in front: the chat a person is reading does not banner its own
  //? messages. A push names its page as `data.url`, spelled with or without the locale and the target's basePath.
  showPushesExcept(pathname: string) {
    if (!isNativeApp() || !push.isSupported("setForegroundPresentation")) return;
    const withoutLang = pathname.replace(/^\/[^/]+/, "") || "/";
    const basePath = window.__AKAN_MOBILE_TARGET__?.basePath?.replace(/^\/+|\/+$/g, "");
    const withoutBasePath =
      basePath && withoutLang.startsWith(`/${basePath}`) ? withoutLang.slice(basePath.length + 1) || "/" : withoutLang;
    void push
      .setForegroundPresentation({
        banner: true,
        list: true,
        sound: true,
        badge: true,
        except: { key: "url", values: [...new Set([pathname, withoutLang, withoutBasePath])] },
      })
      .catch(() => undefined);
  }

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
      app.listen("backProgress", ({ phase, progress }) => {
        if (phase !== "progressed") debugFrame("native.backProgress", { phase });
        this.options.onBackProgress?.({ phase, progress });
      }),
      appState.listen("memoryWarning", ({ level }) => {
        debugFrame("native.memoryWarning", { level });
        this.options.onMemoryWarning?.();
      }),
      push.listen("action", ({ message }) => {
        this.openPushLink(message.data.url);
      }),
    ];
    //? After the listen above reaches the shell: a new back listener starts enabled there, and would undo this.
    const syncing = setTimeout(() => this.syncBack(true), 0);
    return () => {
      clearTimeout(syncing);
      for (const stop of stops) stop();
    };
  }

  /**
   * Tells an Android shell whether back is the page's right now: the keyboard is up, there is history, or the
   * index is still to come. Otherwise the system takes it and shows its own back-to-home animation.
   */
  syncBack(force = false) {
    if (!isNativeApp() || !app.isSupported("setBackEnabled")) return;
    const backState = this.options.backState();
    const enabled = backState.keyboardVisible || this.options.historyIdx() > 0 || !this.#leavesApp(backState.path);
    if (!force && enabled === this.#backEnabled) return;
    this.#backEnabled = enabled;
    void app.setBackEnabled({ enabled }).catch(() => undefined);
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
    if (this.#leavesApp(backState.path)) {
      void app.exit().catch(() => undefined);
      return;
    }
    clientRouter.backOrFallback(window.__AKAN_MOBILE_TARGET__?.indexPath ?? "/", { scrollToTop: false });
  }

  //? a stack a deep link started has nothing under it, so back leaves the app rather than inventing a history
  #leavesApp(path: string) {
    const fallbackPath = window.__AKAN_MOBILE_TARGET__?.indexPath ?? "/";
    return this.#didResetStack || NativeNavigation.#homeRelative(path) === fallbackPath;
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

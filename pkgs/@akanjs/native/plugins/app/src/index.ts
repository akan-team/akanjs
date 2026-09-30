// A namespace import: under React Server Components (react-server) react has no hooks, and named
// imports of them would fail when this module is linked (docs/api.md, O2-3).
import * as React from "react";
import { definePlugin, type VetoHandler, vetoable } from "../../../packages/core/src/index.ts";
import { usePluginEvent } from "../../../packages/react/src/index.ts";
import { web } from "./web.ts";

/**
 * Why the app is about to quit: "user" (Cmd+Q, Dock menu, AppleScript), "session" (logout,
 * restart, shutdown; preventing it cancels the logout), "lastWindowClosed" (the window was closed).
 */
export type QuitReason = "user" | "session" | "lastWindowClosed";

export interface AppInfoResult {
  id: string;
  name: string;
  version: string;
  build: number;
}

export interface AppApi {
  getInfo(): Promise<AppInfoResult>;
  /** The URL that started the app (deep link), or null. */
  getLaunchUrl(): Promise<{ url: string | null }>;
  /** Ends the app without asking onBeforeQuit handlers. Android and desktop only (iOS apps must not quit themselves). */
  exit(): Promise<void>;
  /**
   * Ends the app and starts it again in a new process, without asking onBeforeQuit handlers: after a setting
   * that takes a restart, or to recover an app nobody attends. The web reloads the page; iOS answers UNSUPPORTED.
   */
  relaunch(): Promise<void>;
  /** Sends the app to the background (Android) or minimizes its window (desktop). */
  minimize(): Promise<void>;
  /** Internal: the page's answer to a beforeQuit event. Use onBeforeQuit(). */
  answerBeforeQuit(args: { id: number; allow?: boolean }): Promise<void>;
  /**
   * Android: whether back belongs to the page right now, for a page that listens to backButton. false hands it to
   * the system, which then shows its own back-to-home animation; each new listener starts at true.
   */
  setBackEnabled(args: { enabled: boolean }): Promise<void>;
}

export type BackProgressPhase = "started" | "progressed" | "cancelled";

export interface AppEvents {
  /** A deep link arrived while running. URLs that arrive before anyone listens are delivered to the first listener. */
  urlOpen: { url: string };
  /** Android back gesture/button. While anything listens, back no longer walks the WebView history by itself. */
  backButton: { canGoBack: boolean };
  /** Internal: the app is about to quit (desktop). Use onBeforeQuit(). */
  beforeQuit: { id: number; reason: QuitReason };
  /**
   * Android 14+: a back swipe in progress, for a page that animates it. `progress` runs 0–1; a committed swipe then
   * arrives as backButton, and one let go early as `cancelled`.
   */
  backProgress: { phase: BackProgressPhase; progress: number; swipeEdge: "left" | "right" };
  /**
   * Desktop, an app that carries a server (desktop.server): where it is, at every change and when the first page
   * starts listening. "gaveUp" means it is not started again until the app is.
   */
  serverState: { state: "starting" | "up" | "restarting" | "gaveUp" | "stopped" };
}

export const app = definePlugin<AppApi, AppEvents>("app", {
  methods: ["getInfo", "getLaunchUrl", "exit", "relaunch", "minimize", "answerBeforeQuit", "setBackEnabled"],
  events: ["urlOpen", "backButton", "beforeQuit", "backProgress", "serverState"],
  web,
});

/** Calls `handler` for every deep link while mounted. */
export function useUrlOpen(handler: (url: string) => void): void {
  usePluginEvent(app, "urlOpen", ({ url }) => handler(url));
}

/**
 * Takes over the Android back button while mounted. The handler decides: e.g. close a dialog,
 * `history.back()` when `canGoBack`, or `app.exit()` at the root.
 */
export function useBackButton(handler: (event: { canGoBack: boolean }) => void): void {
  usePluginEvent(app, "backButton", handler);
}

/**
 * Runs `handler` before the app quits (desktop: Cmd+Q, Dock menu, logout, closing the window).
 * Call `event.preventDefault()` to keep running, e.g. after asking to save; `event.reason` tells
 * why. app.exit() does not ask. Elsewhere it never fires (`app.eventImplementation("beforeQuit")`
 * tells). Returns an unregister function.
 */
export const onBeforeQuit: (handler: VetoHandler<{ reason: QuitReason }>) => () => void = vetoable(
  (listener) => app.listen("beforeQuit", listener),
  (args) => app.answerBeforeQuit(args),
);

/** onBeforeQuit while mounted; always calls the latest handler. */
export function useBeforeQuit(handler: VetoHandler<{ reason: QuitReason }>): void {
  const latest = React.useRef(handler);
  latest.current = handler;
  React.useEffect(() => onBeforeQuit((event) => latest.current(event)), []);
}

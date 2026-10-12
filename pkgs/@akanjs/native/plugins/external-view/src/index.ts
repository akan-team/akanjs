import { definePlugin, type FileRef } from "../../../packages/core/src/index.ts";

/**
 * A third-party page shown first-party inside an app window, for signage: a scoreboard, a menu board. The view is a
 * webview of its own laid over the window's page, which cannot draw over it — hide the view to show the page.
 *
 * Nothing of the app reaches the view: no bridge, no init script of the app, no app scheme. It keeps its own browser
 * profile (cookies, storage, cache), so `clearData` never touches the app's, and it navigates only to `allowOrigins`;
 * popups, downloads and device permissions are refused. Listing the plugin in `native.plugins` is what lets an app
 * open one.
 *
 * Windows has every method. macOS (14 or later, for its separate profile) has all but `sendKey`, `setMuted` and
 * `capture`, and sends no `loadFailed` or `consoleMessage`. Linux, iOS and Android: UNSUPPORTED.
 */
export type ExternalViewBounds = "fill" | { x: number; y: number; width: number; height: number };

export type ExternalViewConsoleLevel = "debug" | "info" | "warn" | "error";

export interface ExternalViewOpenOptions {
  /** Names the view in every later call: letters, digits, `-` and `_`. */
  id: string;
  url: string;
  /** The origins it may navigate to (`https://host[:port]`); `url` must be on one. */
  allowOrigins: string[];
  /** Logical pixels in the window's content area; "fill" (default) follows the window's size. */
  bounds?: ExternalViewBounds;
  /** Runs at the start of every top document, before the page's own scripts; read what it keeps with `evaluate`. */
  initScript?: string;
  muted?: boolean;
  /** Media plays with sound without a gesture first (default true): nobody taps a signage screen. */
  autoplay?: boolean;
  /** Sends the page's console as `consoleMessage` from this level up (`true` is "warn"); off by default. */
  console?: boolean | ExternalViewConsoleLevel;
  /** The window it is laid over; the calling page's window by default. */
  window?: number;
}

export interface ExternalViewState {
  id: string;
  window: number;
  url: string;
  visible: boolean;
  /** Times its web process ended and the view loaded its page again. */
  restarts: number;
}

export interface ExternalViewApi {
  /** Opens the view, or brings an open one with this id to these options (a page that mounts again finds it). */
  open(args: ExternalViewOpenOptions): Promise<ExternalViewState>;
  /** Rejects NOT_ALLOWED for a URL on none of its `allowOrigins`. */
  navigate(args: { id: string; url: string }): Promise<void>;
  reload(args: { id: string }): Promise<void>;
  close(args: { id: string }): Promise<void>;
  list(): Promise<ExternalViewState[]>;
  setVisible(args: { id: string; visible: boolean }): Promise<void>;
  setBounds(args: { id: string; bounds: ExternalViewBounds }): Promise<void>;
  /** The script's completion value; a promise is not awaited. An exception answers `null`: catch it in the script. */
  evaluate(args: { id: string; script: string }): Promise<{ value: unknown }>;
  /** A trusted key press (`{ key: "z", code: "KeyZ" }`), whether or not the view has the focus. Windows only. */
  sendKey(args: { id: string; key: string; code: string }): Promise<void>;
  /** The view's own sound only; the system volume is the volume plugin's. Windows only. */
  setMuted(args: { id: string; muted: boolean }): Promise<void>;
  /** Clears the view's cookies, storage and cache; the app's own stay. */
  clearData(args: { id: string }): Promise<void>;
  /** A PNG of the view's content, not of the screen. Windows only. */
  capture(args: { id: string }): Promise<FileRef & { width?: number; height?: number }>;
}

export interface ExternalViewEvents {
  load: { id: string; state: "started" | "finished"; url: string };
  /**
   * A navigation that failed. `errorCode`: `http<status>` for a server's 4xx or 5xx page, else WebView2's own
   * (`hostNameNotResolved`, `cannotConnect`, `timeout`, `certificate`, `disconnected`, …; a refused connection is
   * `unknown`). Windows only.
   */
  loadFailed: { id: string; url: string; errorCode: string };
  /** Its web process ended; the view loads its page again by itself, sooner the first times. */
  gone: { id: string; reason: string; restarts: number };
  /** `dropped`: messages left out before this one, past the rate cap. Windows only. */
  consoleMessage: {
    id: string;
    level: ExternalViewConsoleLevel;
    text: string;
    url?: string;
    line?: number;
    dropped?: number;
  };
}

export const externalView = definePlugin<ExternalViewApi, ExternalViewEvents>("external-view", {
  methods: [
    "open",
    "navigate",
    "reload",
    "close",
    "list",
    "setVisible",
    "setBounds",
    "evaluate",
    "sendKey",
    "setMuted",
    "clearData",
    "capture",
  ],
  events: ["load", "loadFailed", "gone", "consoleMessage"],
});

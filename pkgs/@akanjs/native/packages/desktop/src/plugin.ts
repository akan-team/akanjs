// Desktop plugin API: plugin code that runs in the Bun Worker of a desktop app
// (docs/architecture.md §6). One TypeScript implementation serves macOS, Windows and Linux.

import { EXTERNAL_OPENS_PER_SECOND } from "../../core/src/contract.ts";
import type { AppInfo, CallScope, FileRef } from "../../core/src/index.ts";
import type { QuitReason, Veto } from "./lifecycle.ts";

export type { QuitReason, Veto } from "./lifecycle.ts";
export { createPageVeto, type PageVeto } from "./page-veto.ts";

/**
 * Which pages an event goes to. Default: every page that listens. `{ window }`: only that
 * window's page (window events). "focused": only the most recently focused window that listens
 * (something to handle once, like a deep link).
 */
export type EmitTarget = { window: number } | "focused";

export interface DesktopContext {
  app: AppInfo;
  /**
   * A debug build (boot.json `dev`: `--debug`, and every dev build, whose pages come from a dev server the shell did not
   * start). It has the release app's id, so what it keeps apart goes in folders of its own.
   */
  readonly dev: boolean;
  /**
   * The window whose page made this call (SH-6; 1 = the window the app opened). Only in method
   * calls; undefined in setup and event sources.
   */
  readonly window?: number;
  /**
   * What the app's capabilities allow this method call (PL-11): enforce it with
   * `scopePermits(ctx.scope, { field: value }, pathFields, urlFields)` from @akanjs/native/core. Undefined when no
   * matching grant carries scopes (only the plugin's own rules apply). Only in method calls.
   */
  readonly scope?: CallScope;
  /**
   * Fires when the page gives up on this call (its AbortSignal: v1.1 `cancel`) or the page is gone.
   * The page has its answer by then (CANCELLED or TIMEOUT); stop the work and release what it
   * holds. Only in method calls.
   */
  readonly signal?: AbortSignal;
  /**
   * The calling page's document (one page load; bridge v1.1 `doc`), for what must not outlive it:
   * `ctx.document.own(() => db.close())`. Only in method calls.
   */
  readonly document?: DocumentScope;
  /** Per-app data folder, e.g. ~/Library/Application Support/<app id>. Created on first access. */
  readonly appDataDir: string;
  /**
   * For what is large and belongs to this PC (caches, downloads, databases): %LOCALAPPDATA%\<app id> on Windows,
   * where appDataDir roams with the user; appDataDir on macOS and Linux. Created on first access.
   */
  readonly appLocalDataDir: string;
  /**
   * The executables the app carries (desktop.bin, akanjs `bin`), or null. The host puts the folder first on
   * process.env.PATH, which node:child_process and `Bun.spawn(cmd, { env: process.env })` use; a Bun.spawn or
   * Bun.which without `env` reads the environment the app started with, so name a file here or pass the env.
   */
  readonly binDir: string | null;
  /**
   * The server the app carries (desktop.server), or null. `ready` settles once per session: true when the server
   * first answered ready, false when it could not start or gave up before that; `state` and `onState` follow it after.
   */
  readonly server: DesktopServerStatus | null;
  /** Pushes an event of this plugin to the pages that listen. Returns the windows reached. */
  emit(event: string, data?: unknown, target?: EmitTarget): number[];
  /** Serves a local file at /__akan_native/file/<id> for the rest of the session (PL-7). */
  registerFile(path: string, mime: string): FileRef;
  /**
   * Runs a native shell command on the main thread, e.g. shell("window.setTitle", { title }).
   * Window ops act on `args.window`; without it, on the calling window in a method call, else on
   * the most recently focused window.
   */
  shell(op: string, args?: Record<string, unknown>): Promise<unknown>;
  /** Native shell events ("window", "opened", "pageLoad", …). Returns an unsubscribe function. */
  onNativeEvent(type: string, listener: (event: NativeEvent) => void): () => void;
  /** The app's deep link schemes (deepLinks.schemes in akan-native.config.ts), lowercase. */
  readonly deepLinkSchemes: readonly string[];
  /**
   * What may be handed to the OS (L0): http, https, mailto, tel and security.shell.externalSchemes.
   * Plugins that open URLs outside the app check them and call `externalOpenAllowed()` first.
   */
  readonly externalSchemes: readonly string[];
  /**
   * Hands a launch's arguments to the "opened" listeners when they are a deep link (D6). Windows
   * and Linux start a new process for a link; single-instance passes that process's arguments
   * here. Anything but a single URL of one of the app's schemes is ignored (deeplinks.ts).
   */
  openLinks(args: readonly string[]): void;
  /** Ends the app with an exit code, after the onQuit hooks. Does not ask onBeforeQuit. */
  quit(code?: number): void;
  /**
   * Cleanup before the app quits, however it quits (Cmd+Q, window close, app.exit(), logout).
   * All hooks run together and the app waits for them at most 2 s. Returns an unregister function.
   */
  onQuit(fn: () => void | Promise<void>): () => void;
  /**
   * Runs when any window's page document ends (reload, navigation, window destroyed, renderer
   * gone), after its calls, subscriptions and owned resources were closed. For a plugin's own
   * per-window tables. Returns an unregister function.
   */
  onDocumentEnd(fn: (doc: DocumentInfo) => void): () => void;
  /** Veto for quit requests (Cmd+Q, Dock, AppleScript, logout, last window closed): return false to keep running. */
  onBeforeQuit(fn: Veto<{ reason: QuitReason }>): () => void;
  /** Veto for a window's close button and Cmd+W: return false to keep that window open. */
  onCloseRequested(fn: Veto<{ window: number }>): () => void;
  /**
   * Closes a window without asking (default: the calling window in a method call, else window 1).
   * Another window is left: it is destroyed. It was the last one: the app quits, or hides it when
   * desktop.quitOnLastWindowClosed is false.
   */
  closeWindow(window?: number): void;
  /**
   * Launch phase: only while setup runs, before the window exists. The host waits for every
   * plugin's setup (async allowed, at most 3 s each) before it creates the window. setWindow after
   * that is ignored with a warning.
   */
  readonly launch: {
    /** Creates the window at these bounds (logical points) instead of the configured size (window-state). */
    setWindow(bounds: LaunchWindow): void;
    /**
     * Ends the app before a window is created; onQuit hooks do not run (single-instance). A setup that ran past its
     * time quits the app instead, since its window exists by then.
     */
    exit(code?: number): void;
  };
}

/**
 * "starting" until the server answers ready (again after a crash before that), "up" while it answers, "restarting"
 * after a crash once it had been up, "gaveUp" when it is not started again this session, "stopped" as the app quits.
 */
export type DesktopServerState = "starting" | "up" | "restarting" | "gaveUp" | "stopped";

export interface DesktopServerStatus {
  readonly ready: Promise<boolean>;
  readonly state: DesktopServerState;
  /** Every later change of `state`. Returns an unsubscribe function. */
  onState(listener: (state: DesktopServerState) => void): () => void;
}

/** Which page load ended. `id` is "" for a page that sends no document id (v1 callers, tests). */
export interface DocumentInfo {
  window: number;
  id: string;
}

/**
 * One page load of a window (architecture §3.7 Document scope). Module state of a desktop plugin is
 * App scope: keep per-page state here, or keyed by window and cleared in onDocumentEnd.
 */
export interface DocumentScope extends DocumentInfo {
  /** True once the page is gone. */
  readonly ended: boolean;
  /**
   * Ties a resource to this page: `dispose` runs when it ends (the last owned first), or right away
   * if it already has (a call that finished after its page left). Returns a function that forgets
   * the resource without disposing it (it was closed on request).
   */
  own(dispose: () => unknown): () => void;
}

/** Initial window bounds from the launch phase. The shell drops a position that is on no display. */
export interface LaunchWindow {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  maximized?: boolean;
  /** Borderless fullscreen from the first frame, on the display x and y are on (else the primary one). */
  fullscreen?: boolean;
  /** No taskbar button (Windows, Linux; macOS has none). */
  skipTaskbar?: boolean;
}

/** What the launch phase decided; sent to the main thread with "ready". */
export interface Launch {
  window: LaunchWindow;
  exit?: number;
  /** PUBLIC_* values for the page known only at launch (the carried server's URL), under AKAN_NATIVE_PUBLIC_*. */
  env?: Record<string, string>;
}

export interface NativeEvent {
  type: string;
  [key: string]: unknown;
}

type MethodImpl<F> = F extends (args: infer A) => Promise<infer R>
  ? (args: A, ctx: DesktopContext) => R | Promise<R>
  : F extends () => Promise<infer R>
    ? (args: undefined, ctx: DesktopContext) => R | Promise<R>
    : never;

export interface DesktopPlugin<Api = any, Events = any> {
  id: string;
  /**
   * Runs once when the plugin host starts, before the window exists and before any page call
   * (e.g. to catch launch events). May be async: the window waits for it (ctx.launch).
   */
  setup?(ctx: DesktopContext): void | Promise<void>;
  /**
   * "gate": this setup runs before every other one, one gate plugin after the other, and when one
   * decides the launch exits (ctx.launch.exit, e.g. single-instance handing over to the running
   * instance), the other setups do not run at all.
   */
  launchPhase?: "gate";
  /** A window's page document ended (see DesktopContext.onDocumentEnd). */
  onDocumentEnd?(doc: DocumentInfo, ctx: DesktopContext): void;
  methods: { [K in keyof Api]?: MethodImpl<Api[K]> };
  /**
   * Event sources, started for the first $listen from any page and stopped after the last
   * $unlisten. `emit` reaches the pages that listen (see EmitTarget) and returns their windows
   * (typed `| void` so tests can pass a plain function).
   */
  events?: {
    [E in keyof Events]?: (
      emit: (data: Events[E], target?: EmitTarget) => number[] | void,
      ctx: DesktopContext,
    ) => () => void;
  };
}

/**
 * Plugins' external opens (opener, browser, auth-session, …) happen at most
 * EXTERNAL_OPENS_PER_SECOND times a second, whichever plugin asks (L0; the shell limits the page's
 * links the same way). false: refuse the open (NOT_ALLOWED).
 */
let lastExternalOpen = -Infinity;
const linkClaimers = new Set<(url: string) => boolean>();

/**
 * A plugin that answers some links itself (auth-session's sign-in callback, R10) takes them before
 * the app plugin turns them into urlOpen. `claim` says whether a URL is its own; returns the removal.
 */
export function claimLinks(claim: (url: string) => boolean): () => void {
  linkClaimers.add(claim);
  return () => linkClaimers.delete(claim);
}

/** Whether a plugin took this link (the app plugin then does not deliver it). */
export function linkClaimed(url: string): boolean {
  for (const claim of linkClaimers) {
    try {
      if (claim(url)) return true;
    } catch {
      // A failing claimer claims nothing.
    }
  }
  return false;
}

let limitOpens = true;
/** The shell's own counter (akan_native_external_open_allowed), which the page's links use too. */
let shellLimiter: (() => boolean) | null = null;
export function externalOpenAllowed(now = performance.now()): boolean {
  if (!limitOpens) return true;
  if (shellLimiter) return shellLimiter();
  if (now - lastExternalOpen < 1000 / EXTERNAL_OPENS_PER_SECOND) return false;
  lastExternalOpen = now;
  return true;
}

/** The plugin host: plugins' opens share the shell's counter with the page's links. */
export function useShellOpenLimit(limiter: () => boolean): void {
  shellLimiter = limiter;
}

/** Unit tests only: plugins' tests open many URLs in a row. */
export function limitExternalOpens(enabled: boolean): void {
  limitOpens = enabled;
  lastExternalOpen = -Infinity;
}

export function defineDesktopPlugin<Api, Events = {}>(plugin: DesktopPlugin<Api, Events>): DesktopPlugin<Api, Events> {
  return plugin;
}

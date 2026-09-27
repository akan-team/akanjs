// A namespace import: under React Server Components (react-server) react has no hooks, and named
// imports of them would fail when this module is linked (docs/api.md, O2-3).
import * as React from "react";
import {
  createLiveValue,
  definePlugin,
  type FileRef,
  platform,
  type VetoHandler,
  vetoable,
  windowId,
} from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import { web } from "./web.ts";

/** The app window (desktop). Sizes and positions are logical pixels (CSS px). */
export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  minimized: boolean;
  fullscreen: boolean;
  focused: boolean;
  visible: boolean;
  title: string;
}

/** A window and its id (SH-6: 1 is the window the app opened; others come from createWindow). */
export interface WindowInfo extends WindowState {
  id: number;
}

/** Where a new window opens. Sizes and positions are logical pixels; x and y are the frame's top-left corner. */
export interface CreateWindowOptions {
  /** App path the window loads, e.g. "/settings" (the SPA router sees it). Default "/". */
  path?: string;
  /** Default: the app name. */
  title?: string;
  width?: number;
  height?: number;
  /** Default: offset from the focused window, like new documents on macOS. */
  x?: number;
  y?: number;
}

/** `window`: which window an op acts on. Default: the window of the page that calls. */
type On = { window?: number };

export interface WindowApi {
  getState(args?: On): Promise<WindowState>;
  setTitle(args: { title: string } & On): Promise<WindowState>;
  setSize(args: { width: number; height: number } & On): Promise<WindowState>;
  setPosition(args: { x: number; y: number } & On): Promise<WindowState>;
  center(args?: On): Promise<WindowState>;
  minimize(args?: On): Promise<WindowState>;
  maximize(args?: On): Promise<WindowState>;
  unmaximize(args?: On): Promise<WindowState>;
  /** Un-minimize, un-maximize and focus. */
  restore(args?: On): Promise<WindowState>;
  setFullscreen(args: { value: boolean } & On): Promise<WindowState>;
  setAlwaysOnTop(args: { value: boolean } & On): Promise<WindowState>;
  show(args?: On): Promise<WindowState>;
  hide(args?: On): Promise<WindowState>;
  focus(args?: On): Promise<WindowState>;
  /**
   * Closes the window without asking onCloseRequested handlers. While another window exists it
   * is destroyed; the last window makes the app quit (asking app.onBeforeQuit handlers), or only
   * hides if desktop.quitOnLastWindowClosed is false.
   */
  close(args?: On): Promise<void>;
  /** Moves the window with the mouse; call it from a mousedown on a custom title bar. */
  startDragging(args?: On): Promise<void>;
  toggleMaximize(args?: On): Promise<WindowState>;
  /** Opens another window (desktop). Use createWindow(). */
  create(args?: CreateWindowOptions): Promise<WindowInfo>;
  /** Every window, hidden ones included, by id. Use getAllWindows(). */
  list(): Promise<WindowInfo[]>;
  /** Internal: the page's answer to a closeRequested event. Use onCloseRequested(). */
  answerCloseRequested(args: { id: number; allow?: boolean }): Promise<void>;
}

export interface WindowEvents {
  /** This window's inner size changed. */
  resize: { width: number; height: number };
  /** This window moved. */
  move: { x: number; y: number };
  /** This window gained or lost focus. */
  focus: { focused: boolean };
  /** Internal: the close button or Cmd+W on this window. Use onCloseRequested(). */
  closeRequested: { id: number };
  /** A window was opened (any window). */
  created: { id: number };
  /** A window was destroyed (any window). */
  destroyed: { id: number };
  /** Files dragged over this window from Finder or another app (desktop, plugins.md D9). Use onDragDrop(). */
  dragDrop: DragDropEvent;
}

/**
 * A file drag over the window (desktop). Only drags that carry files are reported. The page's own
 * HTML5 drop events keep working next to it (dataTransfer.files, without paths).
 */
export interface DragDropEvent {
  type: "enter" | "over" | "drop" | "leave";
  /** Absolute paths of the dragged files and folders (enter and drop). */
  paths?: string[];
  /** Pointer position in CSS px from the page's top-left corner (not on leave). */
  position?: { x: number; y: number };
  /** On drop: every regular file, served by the host for this session so the page can fetch() it. */
  files?: (FileRef & { path: string; name: string })[];
}

/** The window plugin. Its ops act on this page's window unless `window` says otherwise. */
export const appWindow = definePlugin<WindowApi, WindowEvents>("window", {
  methods: [
    "getState",
    "setTitle",
    "setSize",
    "setPosition",
    "center",
    "minimize",
    "maximize",
    "unmaximize",
    "restore",
    "setFullscreen",
    "setAlwaysOnTop",
    "show",
    "hide",
    "focus",
    "close",
    "startDragging",
    "toggleMaximize",
    "create",
    "list",
    "answerCloseRequested",
  ],
  events: ["resize", "move", "focus", "closeRequested", "created", "destroyed", "dragDrop"],
  web,
});

// ---------------------------------------------------------------- windows (SH-6)

/** One window, by id. Its methods act on that window from any page. */
export interface WindowHandle {
  readonly id: number;
  /** True for the window this page runs in. */
  readonly isCurrent: boolean;
  getState(): Promise<WindowState>;
  setTitle(title: string): Promise<WindowState>;
  setSize(width: number, height: number): Promise<WindowState>;
  setPosition(x: number, y: number): Promise<WindowState>;
  center(): Promise<WindowState>;
  minimize(): Promise<WindowState>;
  maximize(): Promise<WindowState>;
  unmaximize(): Promise<WindowState>;
  restore(): Promise<WindowState>;
  toggleMaximize(): Promise<WindowState>;
  setFullscreen(value: boolean): Promise<WindowState>;
  setAlwaysOnTop(value: boolean): Promise<WindowState>;
  show(): Promise<WindowState>;
  hide(): Promise<WindowState>;
  focus(): Promise<WindowState>;
  /** Closes it without asking its onCloseRequested handlers (see appWindow.close). */
  close(): Promise<void>;
  /** Calls `fn` once the window is destroyed. Returns an unregister function. */
  onDestroyed(fn: () => void): () => void;
}

/** This page's window id: 1 for the window the app opened. 1 where there is only one window. */
export const currentWindowId: number = windowId ?? 1;

export function windowHandle(id: number): WindowHandle {
  const on = { window: id };
  return {
    id,
    isCurrent: id === currentWindowId,
    getState: () => appWindow.getState(on),
    setTitle: (title) => appWindow.setTitle({ title, ...on }),
    setSize: (width, height) => appWindow.setSize({ width, height, ...on }),
    setPosition: (x, y) => appWindow.setPosition({ x, y, ...on }),
    center: () => appWindow.center(on),
    minimize: () => appWindow.minimize(on),
    maximize: () => appWindow.maximize(on),
    unmaximize: () => appWindow.unmaximize(on),
    restore: () => appWindow.restore(on),
    toggleMaximize: () => appWindow.toggleMaximize(on),
    setFullscreen: (value) => appWindow.setFullscreen({ value, ...on }),
    setAlwaysOnTop: (value) => appWindow.setAlwaysOnTop({ value, ...on }),
    show: () => appWindow.show(on),
    hide: () => appWindow.hide(on),
    focus: () => appWindow.focus(on),
    close: () => appWindow.close(on),
    onDestroyed(fn) {
      const stop = appWindow.listen("destroyed", ({ id: gone }) => {
        if (gone !== id) return;
        stop();
        fn();
      });
      return stop;
    },
  };
}

/** The window this page runs in. */
export function getCurrentWindow(): WindowHandle {
  return windowHandle(currentWindowId);
}

/**
 * Opens another window that loads `path` of this app (desktop). It stays hidden until its page
 * has loaded, like the first window. UNSUPPORTED on web, iOS and Android. Pages of different
 * windows share storage (localStorage, IndexedDB) and can talk through BroadcastChannel.
 */
export async function createWindow(options: CreateWindowOptions = {}): Promise<WindowHandle> {
  return windowHandle((await appWindow.create(options)).id);
}

/** Every window of the app, hidden ones included, by id. Only the current one where there is one window. */
export async function getAllWindows(): Promise<WindowHandle[]> {
  if (!appWindow.isSupported("list")) return [getCurrentWindow()];
  return (await appWindow.list()).map((w) => windowHandle(w.id));
}

// ---------------------------------------------------------------- drag regions (plugins.md D3)
// Elements with data-akan-native-drag-region move the window, like -webkit-app-region: drag in Electron.
// Same rules as tauri/crates/tauri/src/window/scripts/drag.js: clickable elements block dragging,
// "deep" makes the whole subtree draggable, "false" opts out, and on macOS a double click
// toggles maximize on mouseup (so moving away cancels it, as the system does).
const DRAG_ATTR = "data-akan-native-drag-region";
const CLICKABLE = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL", "SUMMARY"]);
const INTERACTIVE_ROLES = new Set(["button", "link", "menuitem", "tab", "checkbox", "radio", "switch", "option"]);

function isClickable(el: HTMLElement): boolean {
  return (
    CLICKABLE.has(el.tagName) ||
    (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable") !== "false") ||
    (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") ||
    INTERACTIVE_ROLES.has(el.getAttribute("role") ?? "")
  );
}

export function isDragRegion(path: EventTarget[]): boolean {
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    const attr = node.getAttribute(DRAG_ATTR);
    if (isClickable(node) && attr === null) return false;
    if (attr === null) continue;
    if (attr === "false") return false;
    if (attr === "deep") return true;
    if (attr === "" || attr === "true") return node === path[0];
  }
  return false;
}

function installDragRegions(): void {
  if (typeof document === "undefined" || appWindow.implementation("startDragging") !== "native") return;
  const mac = platform === "macos";
  let downX = 0;
  let downY = 0;
  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || (e.detail !== 1 && e.detail !== 2) || !isDragRegion(e.composedPath())) return;
    if (mac && e.detail === 2) {
      downX = e.clientX;
      downY = e.clientY;
      return;
    }
    e.preventDefault(); // no text cursor
    e.stopImmediatePropagation();
    void (e.detail === 2 ? appWindow.toggleMaximize() : appWindow.startDragging()).catch(() => {});
  });
  if (mac) {
    document.addEventListener("mouseup", (e) => {
      if (
        e.button === 0 &&
        e.detail === 2 &&
        e.clientX === downX &&
        e.clientY === downY &&
        isDragRegion(e.composedPath())
      ) {
        void appWindow.toggleMaximize().catch(() => {});
      }
    });
  }
}

installDragRegions();

const state = createLiveValue<WindowState | null>(null, (set) => {
  if (!appWindow.isSupported("getState")) return;
  let live = true;
  let last: WindowState | null = null;
  const refresh = () =>
    appWindow
      .getState()
      .then((s) => {
        last = s;
        if (live) set(s);
      })
      .catch(() => {});
  const stops = [
    appWindow.listen("resize", ({ width, height }) => {
      if (!last) return;
      last = { ...last, width, height };
      set(last);
    }),
    appWindow.listen("move", ({ x, y }) => {
      if (!last) return;
      last = { ...last, x, y };
      set(last);
    }),
    // Focus changes often come with (un)minimize and fullscreen: re-read everything.
    appWindow.listen("focus", () => void refresh()),
  ];
  void refresh();
  return () => {
    live = false;
    for (const stop of stops) stop();
  };
});

/** The window state, kept up to date from resize/move/focus events. null until known or where unsupported. */
export function useWindowState(): WindowState | null {
  return useLiveValue(state);
}

// ---------------------------------------------------------------- close requests (plugins.md D4)

/**
 * Runs `handler` when the user asks to close this page's window (close button, Cmd+W). Call
 * `event.preventDefault()` to keep it open, e.g. after asking to save. Without handlers, or if
 * none prevents it, the window closes as usual. Desktop only: elsewhere it never fires
 * (`appWindow.eventImplementation("closeRequested")` tells). Returns an unregister function.
 */
export const onCloseRequested: (handler: VetoHandler<{}>) => () => void = vetoable(
  (listener) => appWindow.listen("closeRequested", listener),
  (args) => appWindow.answerCloseRequested(args),
);

/** onCloseRequested while mounted; always calls the latest handler. */
export function useCloseRequested(handler: VetoHandler<{}>): void {
  const latest = React.useRef(handler);
  latest.current = handler;
  React.useEffect(() => onCloseRequested((event) => latest.current(event)), []);
}

/** Files dragged over this window (desktop). Returns an unsubscribe function; never fires on web or mobile. */
export function onDragDrop(handler: (event: DragDropEvent) => void): () => void {
  return appWindow.listen("dragDrop", handler);
}

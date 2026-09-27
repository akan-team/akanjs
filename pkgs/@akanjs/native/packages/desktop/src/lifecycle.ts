// Quit and close sequence of a desktop app (plugins.md D4). Pure TypeScript, no FFI, so it is unit tested.
//
//   native closeRequested (red button, Cmd+W)  → close vetoes (that window) → closeWindow(window)
//   closeWindow(window) (also window.close())  → destroy it if another window exists (SH-6);
//                                                the last one: quit request "lastWindowClosed", or hide it
//   native quitRequested (Cmd+Q, Dock, AppleScript "user"; logout/restart/shutdown "session")
//                                               → quit vetoes   → quit()
//   quit(code) (also app.exit())               → onQuit hooks (together, bounded) → exit
//
// The shell already told AppKit "no" for a user quit request and "later" for a session one; a
// session request that ends up vetoed must be cancelled explicitly (cancelSessionEnd), which is
// what makes macOS abort the logout.

export type QuitReason = "user" | "session" | "lastWindowClosed";

/** Return false (or resolve to false) to keep the app running / the window open. */
export type Veto<E> = (event: E) => boolean | void | Promise<boolean | void>;

export interface LifecycleOptions {
  quitOnLastWindowClosed: boolean;
  /** Ends the process (akan_native_quit). */
  exit(code: number): void;
  /** The app stays after a logout asked it to quit (akan_native_quit_cancel). */
  cancelSessionEnd(): void;
  /** Hides the last window instead of quitting (quitOnLastWindowClosed: false). */
  hideWindow(window: number): Promise<unknown>;
  /** Destroys a window that is not the last one. */
  destroyWindow?(window: number): Promise<unknown>;
  /** The windows that exist, hidden ones included. Default: only the one being closed. */
  windows?(): Promise<number[]>;
  /** How long quit() waits for the onQuit hooks, all together. Default QUIT_HOOK_TIMEOUT. */
  quitHookTimeout?: number;
}

export interface Lifecycle {
  onQuit(fn: () => void | Promise<void>): () => void;
  onBeforeQuit(fn: Veto<{ reason: QuitReason }>): () => void;
  onCloseRequested(fn: Veto<{ window: number }>): () => void;
  /** A window's close button or Cmd+W: asks the close vetoes, then closeWindow(window). */
  closeRequested(window?: number): Promise<void>;
  /**
   * Closes a window without asking: destroys it while another window exists, else a quit
   * request, or hide (quitOnLastWindowClosed: false).
   */
  closeWindow(window?: number): Promise<void>;
  /** Asks the quit vetoes, then quits. Resolves true when the app quits. */
  requestQuit(reason: QuitReason): Promise<boolean>;
  /** Quits without asking: onQuit hooks, then exit. */
  quit(code?: number): Promise<void>;
}

export const QUIT_HOOK_TIMEOUT = 2000;

async function allow<E>(vetoes: Set<Veto<E>>, event: E, what: string): Promise<boolean> {
  for (const veto of [...vetoes]) {
    try {
      if ((await veto(event)) === false) return false;
    } catch (error) {
      // A broken handler must not keep the app from quitting.
      console.error(`[akan-native] ${what} handler failed`, error);
    }
  }
  return true;
}

function register<T>(set: Set<T>, value: T): () => void {
  set.add(value);
  return () => void set.delete(value);
}

export function createLifecycle(options: LifecycleOptions): Lifecycle {
  const quitHooks = new Set<() => void | Promise<void>>();
  const quitVetoes = new Set<Veto<{ reason: QuitReason }>>();
  const closeVetoes = new Set<Veto<{ window: number }>>();
  let quitting: Promise<void> | null = null;
  let deciding: Promise<boolean> | null = null;
  const closing = new Map<number, Promise<void>>();
  let sessionWaiting = false;

  const quit = (code = 0): Promise<void> => {
    quitting ??= (async () => {
      const hooks = [...quitHooks].map(async (hook) => {
        try {
          await hook();
        } catch (error) {
          console.error("[akan-native] quit hook failed", error);
        }
      });
      const timeout = options.quitHookTimeout ?? QUIT_HOOK_TIMEOUT;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<"late">((resolve) => (timer = setTimeout(() => resolve("late"), timeout)));
      if ((await Promise.race([Promise.all(hooks), late])) === "late")
        console.error(`[akan-native] quit hooks did not finish within ${timeout} ms`);
      clearTimeout(timer);
      sessionWaiting = false;
      options.exit(code);
    })();
    return quitting;
  };

  const requestQuit = (reason: QuitReason): Promise<boolean> => {
    if (reason === "session") sessionWaiting = true;
    if (quitting) return Promise.resolve(true);
    // Cmd+Q pressed again while the page still decides: one decision answers both.
    deciding ??= (async () => {
      const ok = await allow(quitVetoes, { reason }, "beforeQuit");
      deciding = null;
      if (ok) {
        void quit(0);
        return true;
      }
      if (sessionWaiting) {
        sessionWaiting = false;
        options.cancelSessionEnd();
      }
      return false;
    })();
    return deciding;
  };

  const closeWindow = async (window = 1): Promise<void> => {
    const windows = options.windows ? await options.windows() : [window];
    // Windows are equal (Tauri, Electron, Electrobun): closing window 1 keeps the others open.
    if (windows.some((w) => w !== window)) await options.destroyWindow?.(window);
    else if (options.quitOnLastWindowClosed) await requestQuit("lastWindowClosed");
    else await options.hideWindow(window);
  };

  return {
    onQuit: (fn) => register(quitHooks, fn),
    onBeforeQuit: (fn) => register(quitVetoes, fn),
    onCloseRequested: (fn) => register(closeVetoes, fn),
    closeRequested(window = 1) {
      if (quitting) return Promise.resolve();
      // The close button clicked again while that window's page decides: one decision.
      let pending = closing.get(window);
      if (!pending) {
        pending = (async () => {
          try {
            if (await allow(closeVetoes, { window }, "closeRequested")) await closeWindow(window);
          } finally {
            closing.delete(window);
          }
        })();
        closing.set(window, pending);
      }
      return pending;
    },
    closeWindow,
    requestQuit,
    quit,
  };
}

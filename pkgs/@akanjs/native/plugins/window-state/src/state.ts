// Pure window-state logic, unit tested without a window.
import type { SavedWindowState } from "./index.ts";

/** The part of window.getState this plugin reads. */
export interface WindowSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  minimized: boolean;
  fullscreen: boolean;
  visible: boolean;
}

const FORMAT = 1;
/** Anything outside these bounds is a corrupt file, not a window. */
const LIMIT = 1_000_000;

const finite = (v: unknown, min: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= LIMIT;

/** The saved file's contents, or null when it is missing, corrupt or from another format version. */
export function parseSaved(text: string | null): SavedWindowState | null {
  if (!text) return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || v.format !== FORMAT) return null;
  const { x, y, width, height, maximized } = v;
  if (
    !finite(x, -LIMIT) ||
    !finite(y, -LIMIT) ||
    !finite(width, 1) ||
    !finite(height, 1) ||
    typeof maximized !== "boolean"
  )
    return null;
  return { x, y, width, height, maximized };
}

export function serialize(state: SavedWindowState): string {
  const { x, y, width, height, maximized } = state;
  return `${JSON.stringify({ format: FORMAT, x, y, width, height, maximized })}\n`;
}

/**
 * The state to save after `snap`. Only a normal window says where it is; a maximized one only
 * flips the flag, so un-maximizing after a restart returns to the last normal bounds (Tauri
 * window-state keeps prev_x/prev_y for the same reason). Minimized, hidden or full-screen
 * windows change nothing.
 */
export function nextState(prev: SavedWindowState | null, snap: WindowSnapshot): SavedWindowState | null {
  if (snap.minimized || !snap.visible || snap.fullscreen) return prev;
  if (!(snap.width >= 1 && snap.height >= 1)) return prev;
  if (snap.maximized) {
    // Maximized before any normal bounds were seen: keep these so something is restored.
    return prev
      ? { ...prev, maximized: true }
      : { x: snap.x, y: snap.y, width: snap.width, height: snap.height, maximized: true };
  }
  return { x: snap.x, y: snap.y, width: snap.width, height: snap.height, maximized: false };
}

const same = (a: SavedWindowState | null, b: SavedWindowState | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.maximized === b.maximized);

export interface Tracker {
  readonly saved: SavedWindowState | null;
  /** A move or resize happened: capture once things settle. */
  changed(): void;
  /** Captures now (and waits for a capture in flight). */
  flush(): Promise<SavedWindowState | null>;
  /** Forgets the saved state; the next capture starts over. */
  clear(): void;
  stop(): void;
}

export function createTracker(options: {
  initial: SavedWindowState | null;
  read(): Promise<WindowSnapshot>;
  write(state: SavedWindowState): void;
  /** Debounce for move/resize bursts, ms. Also lets the maximize animation finish. */
  delay?: number;
}): Tracker {
  const delay = options.delay ?? 400;
  let saved = options.initial;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<SavedWindowState | null> = Promise.resolve(saved);

  const capture = async (): Promise<SavedWindowState | null> => {
    let snap: WindowSnapshot;
    try {
      snap = await options.read();
    } catch {
      return saved; // the window is gone (quitting)
    }
    const next = nextState(saved, snap);
    if (next && !same(next, saved)) {
      saved = next;
      try {
        options.write(next);
      } catch (error) {
        console.error("[akan-native] window-state: saving failed", error);
      }
    }
    return saved;
  };
  const enqueue = () => (chain = chain.then(capture, capture));
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  return {
    get saved() {
      return saved;
    },
    changed() {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        void enqueue();
      }, delay);
    },
    flush() {
      cancel();
      return enqueue();
    },
    clear() {
      cancel();
      saved = null;
    },
    stop: cancel,
  };
}

import { createLiveValue, definePlugin } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import { readWebDisplays, sameDisplays, web } from "./web.ts";

export { sameDisplays } from "./web.ts";

/**
 * Displays and the mouse cursor (plugins.md §5).
 *
 * Coordinates are logical pixels (CSS px) with the origin at the top-left corner of the primary
 * display (the one with the menu bar) and y growing down: the same space as the window plugin's
 * positions (`appWindow.setPosition`, `getState().x/y`), so a window can be placed on a display
 * with `setPosition({ x: d.workArea.x + 20, y: d.workArea.y + 20 })`. Displays above or left of
 * the primary one have negative coordinates.
 *
 * - macOS: TAO monitors; `workArea` leaves out the menu bar and the Dock (NSScreen visibleFrame).
 *   `change` fires when a display is added, removed or rearranged, or its resolution or scale
 *   changes. Showing or hiding the Dock may not send it; call getDisplays() again before placing
 *   a window if that matters.
 * - Web: one display, the screen the page is on, from `window.screen` (bounds at 0,0; workArea
 *   from availLeft/availTop/availWidth/availHeight). `scale` is devicePixelRatio, which includes
 *   the page zoom. getCursorPoint is UNSUPPORTED: a page only sees the mouse over itself.
 * - Windows: TAO monitors; `workArea` leaves out the taskbar (GetMonitorInfo). `change` fires for
 *   display and work area changes.
 * - Linux: GDK monitors, in the space of the X screen (or the Wayland compositor), whose origin
 *   is the top-left corner of the whole desktop, not always the primary display's. `workArea`
 *   comes from the window manager and is exact for the primary display only. `change` fires when
 *   a display is added, removed or resized, not for work area changes. getCursorPoint is
 *   UNSUPPORTED on Wayland, which tells an app where the pointer is only over its own windows.
 * - iOS and Android: UNSUPPORTED.
 */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Display {
  /** Stable while the display stays connected (macOS: CGDirectDisplayID). 0 on the web. */
  id: number;
  /** As the OS shows it, e.g. "Built-in Retina Display". "" on the web. */
  name: string;
  bounds: ScreenRect;
  /** Where windows can go: bounds without the menu bar, Dock or taskbar. */
  workArea: ScreenRect;
  /** Device pixels per CSS pixel (2 on Retina displays). */
  scale: number;
  primary: boolean;
}

export interface ScreenApi {
  /** The primary display first. */
  getDisplays(): Promise<Display[]>;
  /** Where the mouse pointer is, anywhere on the desktop (it may be over another app). */
  getCursorPoint(): Promise<{ x: number; y: number }>;
}

export interface ScreenEvents {
  /** The displays changed; sent only when getDisplays() would answer differently. */
  change: { displays: Display[] };
}

export const screen = definePlugin<ScreenApi, ScreenEvents>("screen", {
  methods: ["getDisplays", "getCursorPoint"],
  events: ["change"],
  web,
});

const current = createLiveValue<Display[]>(
  readWebDisplays(),
  (set) => {
    let live = true;
    const stop = screen.listen("change", (e) => set(e.displays));
    screen
      .getDisplays()
      .then((displays) => live && set(displays))
      .catch(() => {});
    return () => {
      live = false;
      stop();
    };
  },
  sameDisplays,
);

/**
 * The connected displays, primary first. Re-renders when they change. Before the first answer
 * (and where the plugin is unsupported) it holds the web view of the page's own screen, or [].
 */
export function useDisplays(): Display[] {
  return useLiveValue(current);
}

/** The display that contains the point (e.g. getCursorPoint()), else the nearest one. */
export function displayAt(point: { x: number; y: number }, displays: Display[]): Display | undefined {
  let best: Display | undefined;
  let bestDistance = Infinity;
  for (const d of displays) {
    const { x, y, width, height } = d.bounds;
    const dx = Math.max(x - point.x, 0, point.x - (x + width));
    const dy = Math.max(y - point.y, 0, point.y - (y + height));
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) [best, bestDistance] = [d, distance];
  }
  return best;
}

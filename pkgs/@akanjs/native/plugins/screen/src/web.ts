import { defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { Display, ScreenApi, ScreenEvents, ScreenRect } from "./index.ts";

// Web fallback: one display, the screen the page is on. The Window Management API
// (getScreenDetails) lists every screen but asks for a permission and exists only in Chromium, so
// it is not used. A browser tells the screen's size and its available size; where the available
// part starts is `availLeft`/`availTop`, which are global coordinates (a screen right of the
// primary one has availLeft ≈ its x). Firefox also has `screen.left`/`top` to subtract; elsewhere
// availLeft/availTop are only trusted when they fall inside the screen (the primary screen).

/** The parts of `window.screen` this reads (availLeft/availTop/left/top are non-standard). */
export interface ScreenLike {
  width: number;
  height: number;
  availWidth?: number;
  availHeight?: number;
  availLeft?: number;
  availTop?: number;
  left?: number;
  top?: number;
}

export function webDisplay(s: ScreenLike, devicePixelRatio: number): Display {
  const { width, height } = s;
  const availWidth = s.availWidth ?? width;
  const availHeight = s.availHeight ?? height;
  let x = 0;
  let y = 0;
  if (typeof s.availLeft === "number" && typeof s.availTop === "number") {
    if (typeof s.left === "number" && typeof s.top === "number") {
      [x, y] = [s.availLeft - s.left, s.availTop - s.top];
    } else if (
      s.availLeft >= 0 &&
      s.availTop >= 0 &&
      s.availLeft + availWidth <= width &&
      s.availTop + availHeight <= height
    ) {
      [x, y] = [s.availLeft, s.availTop];
    }
  }
  const bounds: ScreenRect = { x: 0, y: 0, width, height };
  return {
    id: 0,
    name: "",
    bounds,
    workArea: { x, y, width: availWidth, height: availHeight },
    scale: devicePixelRatio > 0 ? devicePixelRatio : 1,
    primary: true,
  };
}

/** [] where there is no DOM (tests, the desktop plugin host). */
export function readWebDisplays(): Display[] {
  if (typeof window === "undefined" || !window.screen) return [];
  return [webDisplay(window.screen as ScreenLike, window.devicePixelRatio)];
}

/** Displays are plain JSON; two lists are the same when they serialize the same. */
export function sameDisplays(a: Display[], b: Display[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export const web = defineWebPlugin<ScreenApi, ScreenEvents>({
  methods: {
    getDisplays: async () => readWebDisplays(),
  },
  events: {
    change(emit) {
      let last = readWebDisplays();
      const check = () => {
        const next = readWebDisplays();
        if (sameDisplays(last, next)) return;
        last = next;
        emit({ displays: next });
      };
      // devicePixelRatio changes (another display, zoom): a resolution query for the current value.
      let query: MediaQueryList | null = null;
      const watchScale = () => {
        query?.removeEventListener("change", onScale);
        query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        query.addEventListener("change", onScale);
      };
      const onScale = () => {
        watchScale();
        check();
      };
      watchScale();
      window.addEventListener("resize", check);
      // Chromium fires `change` on window.screen when its attributes change.
      const target = window.screen as unknown as Partial<EventTarget>;
      target.addEventListener?.("change", check);
      return () => {
        query?.removeEventListener("change", onScale);
        window.removeEventListener("resize", check);
        target.removeEventListener?.("change", check);
      };
    },
  },
});

import { defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { KeyboardApi, KeyboardEvents, KeyboardState } from "./index.ts";

// Mobile browsers keep the layout viewport and shrink the visual viewport when
// the keyboard opens (iOS Safari, and Chrome's default interactive-widget=resizes-visual),
// so the covered height is innerHeight - visualViewport.height.
// Smaller differences come from browser toolbars, not a keyboard.
const MIN_KEYBOARD_HEIGHT = 100;

let last: KeyboardState = { visible: false, height: 0 };

function read(): KeyboardState {
  const vv = window.visualViewport;
  if (!vv) return last;
  // While pinch-zoomed the visual viewport is small for another reason: keep the last value.
  if (Math.abs(vv.scale - 1) > 0.01) return last;
  const covered = Math.max(0, Math.round(window.innerHeight - vv.height));
  last = covered >= MIN_KEYBOARD_HEIGHT ? { visible: true, height: covered } : { visible: false, height: 0 };
  return last;
}

/** Calls `onChange(previous, next)` whenever the visual viewport shows another keyboard state. */
function watch(onChange: (previous: KeyboardState, next: KeyboardState) => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  let previous = read();
  const check = () => {
    const next = read();
    if (next.visible === previous.visible && next.height === previous.height) return;
    const before = previous;
    previous = next;
    onChange(before, next);
  };
  vv.addEventListener("resize", check);
  return () => vv.removeEventListener("resize", check);
}

/** Browsers tell when the keyboard has changed, not before: will and did come together. */
const transition = (showing: boolean) => (emit: (t: { height: number; duration: number }) => void) =>
  watch((previous, next) => {
    if (next.visible === showing && previous.visible !== showing) emit({ height: next.height, duration: 0 });
  });

export const web = defineWebPlugin<KeyboardApi, KeyboardEvents>({
  methods: {
    getState: async () => read(),
    async hide() {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
    },
    // A page cannot change how the browser fits the keyboard (that is the viewport meta's interactive-widget).
    async setResizeMode() {},
  },
  events: {
    change: (emit) => watch((_, next) => emit(next)),
    willShow: transition(true),
    didShow: transition(true),
    willHide: transition(false),
    didHide: transition(false),
  },
});

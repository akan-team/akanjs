import { defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { WindowApi, WindowEvents, WindowState } from "./index.ts";

// In a browser tab the page cannot move or resize its window; only the state and the title map.
function read(): WindowState {
  return {
    x: window.screenX,
    y: window.screenY,
    width: window.innerWidth,
    height: window.innerHeight,
    maximized: false,
    minimized: document.visibilityState === "hidden",
    fullscreen: document.fullscreenElement != null,
    focused: document.hasFocus(),
    visible: document.visibilityState === "visible",
    title: document.title,
  };
}

export const web = defineWebPlugin<WindowApi, WindowEvents>({
  methods: {
    getState: async () => read(),
    async setTitle({ title }) {
      document.title = String(title);
      return read();
    },
  },
  events: {
    resize(emit) {
      const on = () => emit({ width: window.innerWidth, height: window.innerHeight });
      window.addEventListener("resize", on);
      return () => window.removeEventListener("resize", on);
    },
    focus(emit) {
      const on = () => emit({ focused: document.hasFocus() });
      window.addEventListener("focus", on);
      window.addEventListener("blur", on);
      return () => {
        window.removeEventListener("focus", on);
        window.removeEventListener("blur", on);
      };
    },
  },
});

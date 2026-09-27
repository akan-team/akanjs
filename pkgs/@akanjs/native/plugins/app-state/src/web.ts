import { defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { AppStateApi, AppStateEvents, AppStateValue } from "./index.ts";

function read(): AppStateValue {
  if (document.visibilityState === "hidden") return "background";
  return document.hasFocus() ? "active" : "inactive";
}

export const web = defineWebPlugin<AppStateApi, AppStateEvents>({
  methods: {
    getState: async () => ({ state: read() }),
  },
  events: {
    change(emit) {
      let last = read();
      const check = () => {
        const next = read();
        if (next === last) return;
        last = next;
        emit({ state: next });
      };
      // capacitor-plugins/app/src/web.ts only watches visibilitychange; focus and
      // blur add the "inactive" state for a visible window without focus.
      document.addEventListener("visibilitychange", check);
      window.addEventListener("focus", check);
      window.addEventListener("blur", check);
      return () => {
        document.removeEventListener("visibilitychange", check);
        window.removeEventListener("focus", check);
        window.removeEventListener("blur", check);
      };
    },
  },
});

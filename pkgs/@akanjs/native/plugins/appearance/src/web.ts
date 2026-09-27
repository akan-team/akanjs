import { defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { AppearanceApi, AppearanceEvents, AppearanceState } from "./index.ts";

// Web: the `prefers-color-scheme` media query, read and watched with matchMedia. A page cannot
// override it, so set() is left out and rejects UNSUPPORTED.

function query(): MediaQueryList | null {
  return typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
}

export function readWebState(): AppearanceState {
  return { mode: query()?.matches ? "dark" : "light", setting: "system" };
}

export const web = defineWebPlugin<AppearanceApi, AppearanceEvents>({
  methods: {
    get: async () => readWebState(),
  },
  events: {
    change(emit) {
      const q = query();
      if (!q) return () => {};
      const onChange = () => emit(readWebState());
      q.addEventListener("change", onChange);
      return () => q.removeEventListener("change", onChange);
    },
  },
});

import { createLiveValue, definePlugin } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import { web } from "./web.ts";

/**
 * - active: visible and receiving input
 * - inactive: visible but not focused (another window, system overlay, app switcher)
 * - background: not visible
 */
export type AppStateValue = "active" | "inactive" | "background";

export interface AppStateApi {
  getState(): Promise<{ state: AppStateValue }>;
}

/** moderate: the system is running low; critical: it is about to end processes, likely this one. */
export type MemoryWarningLevel = "moderate" | "critical";

export interface AppStateEvents {
  change: { state: AppStateValue };
  /** The system asked the app to give memory back: iOS's memory warning, Android's onTrimMemory and onLowMemory. */
  memoryWarning: { level: MemoryWarningLevel };
}

export const appState = definePlugin<AppStateApi, AppStateEvents>("app-state", {
  methods: ["getState"],
  events: ["change", "memoryWarning"],
  web,
});

const current = createLiveValue<AppStateValue>("active", (set) => {
  let live = true;
  const stop = appState.listen("change", ({ state }) => set(state));
  appState
    .getState()
    .then(({ state }) => live && set(state))
    .catch(() => {});
  return () => {
    live = false;
    stop();
  };
});

/** The current app state. Re-renders on every change (SH-1). */
export function useAppState(): AppStateValue {
  return useLiveValue(current);
}

// A namespace import: under React Server Components (react-server) react has no hooks, and named
// imports of them would fail when this module is linked (docs/api.md, O2-3).
import * as React from "react";
import type { LiveValue, PluginHandle } from "../../core/src/index.ts";

/** Reads a LiveValue and re-renders when it changes. */
export function useLiveValue<T>(value: LiveValue<T>): T {
  return React.useSyncExternalStore(value.subscribe, value.get, value.get);
}

/**
 * Subscribes to a plugin event while the component is mounted (PL-6).
 * The handler may change between renders without resubscribing.
 */
export function usePluginEvent<Events, E extends keyof Events & string>(
  plugin: PluginHandle<any, Events>,
  event: E,
  handler: (data: Events[E]) => void,
): void {
  const ref = React.useRef(handler);
  ref.current = handler;
  React.useEffect(() => plugin.listen(event, (data) => ref.current(data)), [plugin, event]);
}

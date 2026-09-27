// Shared by the menu, tray and global-shortcut tests: a dispatcher around one desktop plugin with a
// scripted native shell.

import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import type { DesktopPlugin, NativeEvent } from "../../../packages/desktop/src/plugin.ts";

/** A dispatcher around one desktop plugin with a scripted shell. */
export function fakeHost(
  plugin: DesktopPlugin,
  answer: (op: string, args?: Record<string, unknown>) => unknown = () => null,
) {
  const shell: { op: string; args?: Record<string, unknown> }[] = [];
  const emitted: { event: string; data: unknown; windows: number[] }[] = [];
  const listeners = new Map<string, Set<(e: NativeEvent) => void>>();
  const dispatcher = createDispatcher([plugin], {
    app: { id: "dev.test", name: "Test", version: "1.0.0" },
    appDataDir: "/nonexistent",
    // One entry per emit, with the windows it reached (the dispatcher sends one message per window).
    emit: (window, { event, data }) => {
      const last = emitted.at(-1);
      if (last && last.event === event && last.data === data && !last.windows.includes(window))
        last.windows.push(window);
      else emitted.push({ event, data, windows: [window] });
    },
    focusOrder: () => [2, 1],
    registerFile: () => ({ url: "", mime: "", size: 0 }),
    shell: async (op, args) => {
      shell.push({ op, args });
      return answer(op, args);
    },
    onNativeEvent: (type, listener) => {
      const set = listeners.get(type) ?? new Set();
      listeners.set(type, set.add(listener));
      return () => set.delete(listener);
    },
  });
  const call = (method: string, args?: unknown, window = 1) =>
    dispatcher.handle(JSON.stringify({ v: 1, id: 1, plugin: plugin.id, method, args }), window);
  const fire = (type: string, e: Record<string, unknown>) => {
    for (const l of listeners.get(type) ?? []) l({ type, ...e });
  };
  return { shell, emitted, call, fire };
}

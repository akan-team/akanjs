import { definePlugin } from "../../../packages/core/src/index.ts";

/**
 * One running instance per app on the desktop. Adding the plugin to akan-native.config.ts turns it on:
 * a second launch hands its arguments to the running instance and exits before it creates a
 * window; the running instance brings its window to the front and emits `secondInstance`.
 *
 * - macOS: launching from Finder, the Dock or `open` already reuses the running app; this
 *   covers direct launches of the executable and `open -n`. Deep links reach the running app
 *   through the `app` plugin's `urlOpen` either way.
 * - Windows and Linux (later): deep links arrive as arguments, so this plugin is how they reach
 *   the running instance (plugins.md §5).
 * - Web, iOS and Android: UNSUPPORTED (the OS keeps one instance).
 *
 * Events that arrive before the page listens are kept (up to 16) and delivered to the first
 * listener, like deep links (plugins.md C2).
 */
export interface SecondInstance {
  /** The second launch's arguments, without the executable. */
  args: string[];
  /** Its working directory, for resolving relative paths in `args`. */
  cwd: string;
}

export interface SingleInstanceEvents {
  secondInstance: SecondInstance;
}

export const singleInstance = definePlugin<{}, SingleInstanceEvents>("single-instance", {
  methods: [],
  events: ["secondInstance"],
});

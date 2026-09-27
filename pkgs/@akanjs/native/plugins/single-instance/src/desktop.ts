// Desktop: claims the instance socket in the launch phase, before a window exists, so a second
// launch exits without ever showing one.
import { RetainedEvents } from "../../../packages/core/src/kernel.ts";
import { type DesktopContext, defineDesktopPlugin, type EmitTarget } from "../../../packages/desktop/src/plugin.ts";
import type { SecondInstance, SingleInstanceEvents } from "./index.ts";
import { claim, socketPath } from "./socket.ts";

/** Shows, un-minimizes (keeping it maximized if it was) and focuses the window. */
async function bringToFront(ctx: DesktopContext): Promise<void> {
  await ctx.shell("window.show");
  await ctx.shell("window.unminimize");
  await ctx.shell("window.focus");
}

export function createDesktopSingleInstance(
  options: { path?: (appId: string) => string; args?: () => string[]; cwd?: () => string } = {},
) {
  /** Kept for the first listener (plugins.md C2, kernel RetainedEvents), like deep links before the page is ready. */
  const messages = new RetainedEvents<SecondInstance>();
  let listens = 0;

  const received = (ctx: DesktopContext, message: SecondInstance) => {
    bringToFront(ctx).catch((error) => console.error("[akan-native] single-instance: cannot focus the window", error));
    // Windows and Linux open a deep link by starting the app again (D6): it arrives here.
    ctx.openLinks(message.args);
    messages.emit(message, true);
  };

  return defineDesktopPlugin<{}, SingleInstanceEvents>({
    id: "single-instance",
    // Before every other plugin: a second launch exits without setting anything else up (N3).
    launchPhase: "gate",
    async setup(ctx) {
      const path = (options.path ?? socketPath)(ctx.app.id);
      const message = { args: options.args?.() ?? process.argv.slice(2), cwd: options.cwd?.() ?? process.cwd() };
      const result = await claim(path, message, (m) => received(ctx, m));
      if (result.kind === "forwarded") {
        console.info(
          "[akan-native] single-instance: another instance is already running; handed over to it and exiting",
        );
        ctx.launch.exit(0);
      } else if (result.kind === "primary") {
        ctx.onQuit(() => result.close());
      } else {
        console.warn(`[akan-native] single-instance: running without the lock (${result.error.message})`);
      }
    },
    methods: {},
    events: {
      secondInstance(emit) {
        // One page handles it (several windows may listen): the most recently focused one.
        const key = String(++listens);
        messages.listen(
          key,
          (m) => ((emit as (m: SecondInstance, target?: EmitTarget) => number[] | void)(m, "focused")?.length ?? 1) > 0,
        );
        return () => messages.unlisten(key);
      },
    },
  });
}

export default createDesktopSingleInstance();

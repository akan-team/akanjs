// Desktop. macOS: a `caffeinate` child process holds the power assertions, from the Bun Worker.
// - `-d` keeps the display on (PreventUserIdleDisplaySleep), `-i` the system (PreventUserIdleSystemSleep);
//   `pmset -g assertions` lists both "on behalf of Process ID <app pid>" while it runs (verified).
// - `-w <pid>` ends caffeinate when the app process exits, also after a crash, so a killed app never
//   leaves the Mac awake (verified). The Worker shares the app's process, so process.pid is the app.
// - plugins.md §4.1 proposes IOPMAssertionCreateWithName; calling IOKit needs native code or FFI,
//   caffeinate creates the same assertions with no code in the shell.
// Windows and Linux: the shell holds the request, `power.preventSleep` / `power.allowSleep` → null
// (native/desktop/src/win/power.rs: a power request for the display and the system, the two
// assertions caffeinate makes; linux/power.rs: an inhibitor of the desktop portal or of
// org.freedesktop.ScreenSaver on the session bus). Both end with the app process, as caffeinate -w
// does. A Linux session with neither service (a bare X server) answers UNSUPPORTED.
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { KeepAwakeApi } from "./index.ts";

export const CAFFEINATE = "/usr/bin/caffeinate";

export interface Child {
  readonly exitCode: number | null;
  kill(): void;
  readonly exited: Promise<number>;
}

export type Spawner = (argv: string[]) => Child;

const spawnChild: Spawner = (argv) => Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });

/**
 * The pages that asked (architecture review: keep-awake is document scope, like the web's Wake
 * Lock). The display stays on while one of them is loaded and has not called allowSleep; a page
 * that reloads, navigates away or whose window closes lets go by itself.
 */
function holders(release: () => Promise<void>) {
  const pages = new Map<string, () => void>();
  const key = (ctx: DesktopContext) => `${ctx.window ?? 1}:${ctx.document?.id ?? ""}`;
  const letGo = async (page: string) => {
    if (!pages.delete(page) || pages.size > 0) return;
    await release();
  };
  return {
    get held() {
      return pages.size > 0;
    },
    /** Records the calling page; true when it is the first holder. */
    add(ctx: DesktopContext): boolean {
      const page = key(ctx);
      if (pages.has(page)) return false;
      const first = pages.size === 0;
      pages.set(page, () => {});
      const disown = ctx.document?.own(() => letGo(page));
      if (disown) pages.set(page, disown);
      return first;
    },
    /** The first holder's request failed: forget it again. */
    drop(ctx: DesktopContext) {
      const page = key(ctx);
      pages.get(page)?.();
      pages.delete(page);
    },
    remove(ctx: DesktopContext): Promise<void> {
      const page = key(ctx);
      pages.get(page)?.();
      return letGo(page);
    },
  };
}

/** Windows and Linux: the shell's power request. */
function shellKeepAwake() {
  let shell: DesktopContext["shell"] | null = null;
  const pages = holders(async () => {
    // Always resolves (KeepAwakeApi); the request ends with the process anyway.
    await shell?.("power.allowSleep").catch((error) =>
      console.error("[akan-native] keep-awake: power.allowSleep failed", error),
    );
  });
  return defineDesktopPlugin<KeepAwakeApi>({
    id: "keep-awake",
    methods: {
      async keepAwake(_args, ctx: DesktopContext) {
        shell = ctx.shell;
        if (!pages.add(ctx)) return;
        try {
          await ctx.shell("power.preventSleep");
        } catch (error) {
          pages.drop(ctx);
          throw error;
        }
      },
      allowSleep: (_args, ctx: DesktopContext) => pages.remove(ctx),
      isKeptAwake: () => ({ value: pages.held }),
    },
  });
}

/**
 * `spawn` is replaceable so tests can check the command without keeping the Mac awake, `platform`
 * so they can check the shell ops of Windows and Linux on any OS.
 */
export function createDesktopKeepAwake(
  spawn: Spawner = spawnChild,
  pid: number = process.pid,
  platform: NodeJS.Platform = process.platform,
) {
  if (platform !== "darwin") return shellKeepAwake();
  let child: Child | null = null;
  const alive = () => child !== null && child.exitCode === null;
  const pages = holders(async () => {
    const current = child;
    child = null;
    if (!current || current.exitCode !== null) return;
    current.kill();
    await current.exited;
  });

  return defineDesktopPlugin<KeepAwakeApi>({
    id: "keep-awake",
    methods: {
      keepAwake(_args, ctx: DesktopContext) {
        pages.add(ctx);
        if (alive()) return;
        try {
          child = spawn([CAFFEINATE, "-d", "-i", "-w", String(pid)]);
        } catch (error) {
          child = null;
          pages.drop(ctx);
          throw new AkanNativeError("INTERNAL", `cannot start ${CAFFEINATE}: ${(error as Error).message}`);
        }
      },
      allowSleep: (_args, ctx: DesktopContext) => pages.remove(ctx),
      isKeptAwake: () => ({ value: alive() }),
    },
  });
}

export default createDesktopKeepAwake();

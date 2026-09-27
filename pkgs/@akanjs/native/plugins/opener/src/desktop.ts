// Desktop. macOS: the `open` command and a LaunchServices lookup, from the Bun Worker.
// - `open -u` treats the argument as a URL even if it also names a file; it exits 1 with
//   kLSApplicationNotFoundErr when no app claims the scheme (verified), mapped to NOT_FOUND.
// - canOpenUrl asks NSWorkspace.URLForApplicationToOpenURL through JXA: no UI, no Apple Events
//   (so no automation prompt), about 40 ms (verified). electrobun nativeWrapper.mm:8406-8416 calls
//   NSWorkspace openURL directly; native AppKit code waits for the Q-P6 decision.
// - openSettings opens Privacy & Security, where the app's permissions live; electrobun opens its
//   pane the same way (electrobun/package/src/sdks/main/core/Utils.ts:370-374).
// Windows and Linux: the shell's `shell.open` { url } → null and `shell.handler` { url } → { app }
// (native/desktop/src/win/open.rs: ShellExecuteExW and AssocQueryStringW; linux/open.rs: GIO's
// default handlers, the ones xdg-open uses). Both answer NOT_FOUND when no app claims the scheme.
// openSettings opens Settings › Privacy & security on Windows; Linux desktops have no common page.
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin, externalOpenAllowed } from "../../../packages/desktop/src/plugin.ts";
import type { OpenerApi } from "./index.ts";
import { checkUrl, checkUrlScope } from "./url.ts";

export interface Command {
  code: number;
  stdout: string;
  stderr: string;
}

export type Runner = (argv: string[]) => Promise<Command>;

const spawnRunner: Runner = async (argv) => {
  const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
};

const LOOKUP = `function run(argv) {
  ObjC.import("AppKit");
  var url = $.NSURL.URLWithString(argv[0]);
  if (url.isNil()) return "";
  var app = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL(url);
  return app.isNil() ? "" : app.path.js;
}`;

const SETTINGS = "x-apple.systempreferences:com.apple.preference.security";
/** Settings › Privacy & security (ms-settings URIs: learn.microsoft.com/windows/apps/develop/launch/launch-settings-app). */
const WINDOWS_SETTINGS = "ms-settings:privacy";

async function open(run: Runner, url: string): Promise<void> {
  const { code, stderr } = await run(["/usr/bin/open", "-u", url]);
  if (code === 0) return;
  if (/-10814|No application knows/.test(stderr)) throw new AkanNativeError("NOT_FOUND", `no app can open ${url}`);
  throw new AkanNativeError("INTERNAL", `open failed (${code}): ${stderr.trim()}`);
}

/**
 * `run` is replaceable so tests can check the commands without opening anything, `platform` so
 * they can check the Windows and Linux paths (shell ops) on any OS.
 */
export function createDesktopOpener(run: Runner = spawnRunner, platform: NodeJS.Platform = process.platform) {
  const mac = platform === "darwin";
  const shellOpen = async (ctx: DesktopContext, url: string) => {
    await ctx.shell("shell.open", { url });
  };
  return defineDesktopPlugin<OpenerApi>({
    id: "opener",
    methods: {
      async openUrl(args, ctx) {
        const url = checkUrl(args?.url, ctx.externalSchemes);
        checkUrlScope(ctx.scope, url);
        if (!externalOpenAllowed())
          throw new AkanNativeError("NOT_ALLOWED", "at most one URL per second leaves the app; try again later");
        if (mac) await open(run, url.href);
        else await shellOpen(ctx, url.href);
      },
      async canOpenUrl(args, ctx) {
        const url = checkUrl(args?.url, ctx.externalSchemes);
        if (!mac)
          return {
            value: ((await ctx.shell("shell.handler", { url: url.href })) as { app: string | null }).app !== null,
          };
        const { code, stdout, stderr } = await run(["/usr/bin/osascript", "-l", "JavaScript", "-e", LOOKUP, url.href]);
        if (code !== 0)
          throw new AkanNativeError("INTERNAL", `LaunchServices lookup failed (${code}): ${stderr.trim()}`);
        return { value: stdout.trim().length > 0 };
      },
      async openSettings(_args, ctx) {
        if (!externalOpenAllowed())
          throw new AkanNativeError("NOT_ALLOWED", "at most one URL per second leaves the app; try again later");
        if (mac) await open(run, SETTINGS);
        else if (platform === "win32") await shellOpen(ctx, WINDOWS_SETTINGS);
        else
          throw new AkanNativeError("UNSUPPORTED", "Linux desktops have no common settings page for app permissions");
      },
    },
  });
}

export default createDesktopOpener();

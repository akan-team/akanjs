// Desktop: the default browser, from the Bun Worker. An in-app browser would need a second
// window and a second webview, which the shell does not offer; the system browser also has the
// user's sessions and password manager, which is the point of this plugin.
// - macOS: `open -u` treats the argument as a URL even if it also names a file (plugins/opener/src/desktop.ts).
// - Windows and Linux: the shell's `shell.open` op (native/desktop/src/win/open.rs, linux/open.rs).
// - close() is not offered (another app's window; the manifest's desktop methods leave it out, so the
//   page gets UNSUPPORTED) and `finished` never fires: the source exists only so that listening
//   does not fail.
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { defineDesktopPlugin, externalOpenAllowed } from "../../../packages/desktop/src/plugin.ts";
import { checkColor, checkUrl } from "./args.ts";
import type { BrowserApi, BrowserEvents } from "./index.ts";

export type Runner = (argv: string[]) => Promise<{ code: number; stderr: string }>;

const spawnRunner: Runner = async (argv) => {
  const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "pipe" });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  return { code, stderr };
};

/** `run` is replaceable so tests can check the command without opening a browser, `platform` to test the shell op path. */
export function createDesktopBrowser(run: Runner = spawnRunner, platform: NodeJS.Platform = process.platform) {
  return defineDesktopPlugin<BrowserApi, BrowserEvents>({
    id: "browser",
    methods: {
      async open(args, ctx) {
        const url = checkUrl(args?.url);
        checkColor(args?.toolbarColor);
        if (!externalOpenAllowed())
          throw new AkanNativeError("NOT_ALLOWED", "at most one URL per second leaves the app; try again later");
        if (platform !== "darwin") {
          await ctx.shell("shell.open", { url: url.href });
          return;
        }
        const { code, stderr } = await run(["/usr/bin/open", "-u", url.href]);
        if (code !== 0) throw new AkanNativeError("INTERNAL", `open failed (${code}): ${stderr.trim()}`);
      },
    },
    events: {
      finished: () => () => {},
    },
  });
}

export default createDesktopBrowser();

// Desktop: the default browser, and the redirect back as a deep link, from the Bun Worker.
// - The provider redirects to <callbackScheme>://…; macOS hands URLs of schemes in the app's
//   CFBundleURLTypes to the app, TAO turns them into Event::Opened and the shell into the "opened"
//   native event (plugins.md D6), which plugins/app also turns into urlOpen. Windows and Linux
//   start the app with the link, which reaches the running app through single-instance and
//   becomes the same event (packages/desktop/src/deeplinks.ts).
// - The scheme is checked first, against the bundle's Info.plist on macOS and the app's
//   deepLinks.schemes elsewhere: an unregistered scheme would open nothing and leave start()
//   waiting (`open` asks the user to pick an app, or fails).
// - There is no signal for "the user closed the browser tab": start() rejects CANCELLED after
//   TIMEOUT_MS, or when a newer start() replaces it. Links that arrive with no start() waiting are
//   left to the app plugin. tauri-plugins-workspace/plugins/deep-link does the same on macOS: it
//   only forwards RunEvent::Opened (src/lib.rs:588-590) and the app matches the URL itself.
// ASWebAuthenticationSession exists on macOS too but needs native code in the shell.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { claimLinks, defineDesktopPlugin, externalOpenAllowed } from "../../../packages/desktop/src/plugin.ts";
import { checkStart, isAnswer } from "./args.ts";
import type { AuthSessionApi } from "./index.ts";

export const TIMEOUT_MS = 10 * 60 * 1000;

export type Runner = (argv: string[]) => Promise<{ code: number; stderr: string }>;

const spawnRunner: Runner = async (argv) => {
  const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "pipe" });
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  return { code, stderr };
};

/** CFBundleURLSchemes of an XML Info.plist (the CLI writes XML), or null if there is none to read. */
export function registeredSchemes(plist: string | null): string[] | null {
  if (plist === null) return null;
  // The key only occurs inside CFBundleURLTypes entries.
  const schemes: string[] = [];
  for (const block of plist.matchAll(/<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g)) {
    for (const s of block[1]!.matchAll(/<string>([^<]*)<\/string>/g)) schemes.push(s[1]!.toLowerCase());
  }
  return schemes;
}

function bundlePlist(): string | null {
  try {
    // .app/Contents/MacOS/<exe> → .app/Contents/Info.plist (packages/desktop/src/ffi.ts resolvePaths)
    return readFileSync(join(dirname(process.execPath), "..", "Info.plist"), "utf8");
  } catch {
    return null; // not running from an app bundle (tests, plain bun)
  }
}

interface Pending {
  scheme: string;
  /** The start URL's OAuth `state`: the callback must carry it (args.ts isAnswer). */
  state: string | null;
  resolve(result: { url: string }): void;
  reject(error: AkanNativeError): void;
  timer: ReturnType<typeof setTimeout>;
}

/** Replaceable parts for tests: the command runner, the Info.plist text, the OS and the timeout. */
export function createDesktopAuthSession(
  options: { run?: Runner; plist?: () => string | null; timeoutMs?: number; platform?: NodeJS.Platform } = {},
) {
  const run = options.run ?? spawnRunner;
  const plist = options.plist ?? bundlePlist;
  const platform = options.platform ?? process.platform;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  let pending: Pending | null = null;

  const settle = (fn: (p: Pending) => void) => {
    const p = pending;
    if (!p) return;
    pending = null;
    clearTimeout(p.timer);
    fn(p);
  };

  // Callbacks that answered a start(): the app plugin may ask after this plugin saw the link, or before.
  const answered = new Set<string>();
  const claim = (url: string): boolean => {
    if (answered.has(url)) return true;
    if (!pending || !isAnswer(url, pending.scheme, pending.state)) return false;
    settle((p) => p.resolve({ url }));
    answered.add(url);
    setTimeout(() => answered.delete(url), 10_000).unref?.();
    return true;
  };

  return defineDesktopPlugin<AuthSessionApi>({
    id: "auth-session",
    setup(ctx) {
      // The callback ends start() and does not also reach app.urlOpen (R10; iOS never delivers it there).
      claimLinks(claim);
      ctx.onNativeEvent("opened", (event) => {
        for (const url of (event.urls as string[] | undefined) ?? []) claim(url);
      });
    },
    methods: {
      async start(args, ctx) {
        const { url, callbackScheme } = checkStart(args);
        const mac = platform === "darwin";
        if (!mac && platform !== "win32" && platform !== "linux")
          throw new AkanNativeError("UNSUPPORTED", `auth-session is not implemented on ${platform}`);
        const schemes = mac ? registeredSchemes(plist()) : [...ctx.deepLinkSchemes];
        if (schemes && !schemes.includes(callbackScheme)) {
          throw new AkanNativeError(
            "INVALID_ARGS",
            `the app does not handle ${callbackScheme}: links; add it to deepLinks.schemes in akan-native.config.ts`,
          );
        }
        if (!externalOpenAllowed())
          throw new AkanNativeError("NOT_ALLOWED", "at most one URL per second leaves the app; try again later");
        settle((p) => p.reject(new AkanNativeError("CANCELLED", "replaced by a newer start()")));
        const result = new Promise<{ url: string }>((resolve, reject) => {
          const timer = setTimeout(
            () => settle((p) => p.reject(new AkanNativeError("CANCELLED", "no sign-in callback arrived in time"))),
            timeoutMs,
          );
          pending = { scheme: callbackScheme, state: url.searchParams.get("state"), resolve, reject, timer };
        });
        const mine = pending;
        if (mac) {
          const opened = await run(["/usr/bin/open", "-u", url.href]);
          if (opened.code !== 0 && pending === mine) {
            settle((p) =>
              p.reject(new AkanNativeError("INTERNAL", `open failed (${opened.code}): ${opened.stderr.trim()}`)),
            );
          }
        } else {
          await ctx.shell("shell.open", { url: url.href }).catch((error: unknown) => {
            if (pending === mine)
              settle((p) =>
                p.reject(
                  new AkanNativeError("INTERNAL", `cannot open the browser: ${(error as Error)?.message ?? error}`),
                ),
              );
          });
        }
        return result;
      },
    },
  });
}

export default createDesktopAuthSession();

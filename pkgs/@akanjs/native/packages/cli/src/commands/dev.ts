// akan-native dev <platform>: build, launch, then rebuild on every change in the app folder.
//   web     static server + live reload (server-sent events)
//   macos, windows, linux
//           the web files of the running app are replaced in place; its plugin host reloads the page
//   ios     rebuild → reinstall → relaunch on the simulator
//   android rebuild (Kotlin is cached) → reinstall → relaunch on the emulator
//
// akan-native dev <platform> --hmr: state-preserving HMR (React Fast Refresh). Bun's dev server bundles
// web.devEntry; the native app is built once with a `devServer` and loads its pages through the
// dev gateway (lib/hmr.ts). Only akan-native.config.* and .env* changes rebuild and relaunch.

import { cpSync, mkdirSync, rmSync, watch, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { checkFlags, type ParsedArgs, parseArgs, stringFlag } from "../lib/args.ts";
import { openHeadless } from "../lib/chrome.ts";
import { type HmrContext, lanAddress, resolveDevEntry, startHmrServer } from "../lib/hmr.ts";
import { envFromProcess, type Launched, onStopSignal, printLine } from "../lib/launch.ts";
import { bold, CliError, dim, log } from "../lib/log.ts";
import { prepare } from "../lib/prepare.ts";
import { findAppDir, loadProject } from "../lib/project.ts";
import { LiveReload } from "../lib/serve.ts";
import { launchAndroid } from "../platforms/android.ts";
import { type DesktopOs, resourcesOf } from "../platforms/desktop.ts";
import { PLATFORM_TARGETS, TARGETS, type TargetPlatform } from "../platforms/index.ts";
import { buildWeb } from "../platforms/web.ts";
import { launchWeb, webInitScript } from "../platforms/web-run.ts";
import { BOOLEAN_FLAGS, buildFromArgs, LAUNCH_FLAGS } from "./build.ts";

export const DEV_USAGE =
  `akan-native dev <${TARGETS.join("|")}> [--app <dir>] [--mode <mode>] [--port <n>] [--headless] [--hmr] [--device <name>] [--avd <name>]` +
  ` [--upstream <url>] [--hmr-path <path>] [--start <path>] [--lan]`;

/** Always a debug build (live reload, the dev server). */
const DEBUG = { mode: "development", profile: "debug" } as const;

// akan-native-env.d.ts is written by the build itself (ENV-7).
const IGNORED = /(^|\/)(node_modules|\.akan|\.git|\.DS_Store)(\/|$)|\.log$|^akan-native-env\.d\.ts$/;

/** Files whose change needs a new native build (and init.js) with --hmr; Bun handles the rest. */
const CONFIG_FILE = /^(akan-native\.config\.(ts|js|mjs)|\.env(\..+)?)$/;

export async function dev(argv: string[]): Promise<number> {
  const args = parseArgs(argv, [...BOOLEAN_FLAGS, "hmr", "lan"]);
  checkFlags(
    args,
    ["app", "mode", "skip-web-build", "hmr", "upstream", "hmr-path", "start", "lan", ...LAUNCH_FLAGS],
    DEV_USAGE,
  );
  const platform = args.positional[0] as TargetPlatform | undefined;
  if (!platform || !TARGETS.includes(platform)) throw new CliError(`expected a platform: ${TARGETS.join(", ")}`, 2);
  const headless = args.flags.headless === true;
  const env = envFromProcess();
  // An external dev server (O4-1) always goes through the gateway.
  if (args.flags.hmr === true || stringFlag(args, "upstream")) return devHmr(platform, args, env, headless);

  const desktop =
    platform === "macos" || platform === "windows" || platform === "linux" ? (platform as DesktopOs) : null;
  let { ctx, artifact } = await buildFromArgs(args, DEBUG, platform, { startPath: stringFlag(args, "start") });
  const reload = new LiveReload();
  let app: Launched;
  if (platform === "web") {
    app = await launchWeb(ctx, artifact, {
      env,
      headless: false,
      port: Number(stringFlag(args, "port") ?? 4173),
      liveReload: reload,
      onReady: (url) => log.ok(`dev server ${bold(url)} (live reload)`),
    });
  } else {
    app = await PLATFORM_TARGETS[platform].launch(ctx, artifact, {
      env: { ...env, AKAN_NATIVE_DEV_WATCH: "1" },
      headless,
    });
  }

  const webDir = ctx.webDir;
  const appDir = ctx.project.appDir;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();
  const changed = new Set<string>();

  const rebuild = async () => {
    const files = [...changed];
    changed.clear();
    log.step(`changed: ${files.slice(0, 3).join(", ")}${files.length > 3 ? ` +${files.length - 3}` : ""}`);
    const started = performance.now();
    try {
      if (platform === "web") {
        ctx = await prepare(ctx.project, "web", { mode: ctx.mode, profile: "debug", skipWebBuild: false });
        await buildWeb(ctx);
        reload.reload();
      } else if (desktop) {
        // Only the web files change: swap them inside the running app.
        const next = await prepare(ctx.project, platform, { mode: ctx.mode, profile: "debug", skipWebBuild: false });
        const target = join(resourcesOf(desktop, artifact), "app");
        rmSync(target, { recursive: true, force: true });
        mkdirSync(target, { recursive: true });
        cpSync(next.webDir, target, { recursive: true });
        writeFileSync(join(target, "index.html"), next.html);
        ctx = next;
      } else {
        app.stop();
        await app.exited.catch(() => 0);
        const { "skip-web-build": _skip, ...flags } = args.flags;
        ({ ctx, artifact } = await buildFromArgs({ ...args, flags }, DEBUG, platform, {
          startPath: stringFlag(args, "start"),
        }));
        app = await PLATFORM_TARGETS[platform].launch(ctx, artifact, {
          env: { ...env, AKAN_NATIVE_DEV_WATCH: "1" },
          headless,
        });
      }
      log.ok(`updated in ${Math.round(performance.now() - started)} ms`);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
    }
  };

  const watcher = watch(appDir, { recursive: true }, (_event, file) => {
    if (!file) return;
    const path = resolve(appDir, file);
    const rel = relative(appDir, path).split(sep).join("/");
    // The SPA build writes web.dir: watching it would loop.
    if (IGNORED.test(rel) || path === webDir || path.startsWith(webDir + sep)) return;
    changed.add(rel);
    clearTimeout(timer);
    timer = setTimeout(() => {
      running = running.then(rebuild);
    }, 200);
  });
  log.info(dim(`watching ${appDir} (Ctrl+C to stop)`));
  if (desktop) log.info(dim(`app: ${ctx.project.config.app.fileName}`));

  await new Promise<void>((done) => {
    const off = onStopSignal(() => {
      off();
      done();
    });
  });
  watcher.close();
  app.stop();
  return 0;
}

async function devHmr(
  platform: TargetPlatform,
  args: ParsedArgs,
  env: Record<string, string>,
  headless: boolean,
): Promise<number> {
  const appDir = findAppDir(stringFlag(args, "app") ?? process.cwd());
  const context: HmrContext = { project: await loadProject(appDir) };
  const upstream = stringFlag(args, "upstream");
  const entry = upstream ? undefined : resolveDevEntry(context.project);
  const native = platform !== "web";
  // --lan (O4-3): a real iPhone reaches the Mac's LAN address; Android devices use adb reverse.
  const lan = args.flags.lan === true && platform === "ios" ? lanAddress() : undefined;
  if (args.flags.lan === true && platform === "ios" && !lan)
    throw new CliError("--lan: this Mac has no private IPv4 address on a network");
  log.step(upstream ? `dev gateway for ${upstream}` : `hmr: Bun dev server for ${relative(appDir, entry!) || entry}`);
  const server = await startHmrServer({
    platform,
    entry,
    upstream,
    hmrPath: stringFlag(args, "hmr-path"),
    // Native hosts reach the gateway on 127.0.0.1 (Android through adb reverse), so any free port works.
    port: Number(stringFlag(args, "port") ?? (native ? 0 : 4173)),
    hostname: lan ? "0.0.0.0" : native ? "127.0.0.1" : "localhost",
    publicHost: lan,
    context,
    onLine: (line) => log.info(dim(`[bun] ${line}`)),
    onWarning: (text) => log.warn(text),
  });
  const devServer = native ? server.url : undefined;
  const startPath = stringFlag(args, "start");

  let flags = args.flags;
  const launch = async (): Promise<Launched> => {
    const { ctx, artifact } = await buildFromArgs({ ...args, flags }, DEBUG, platform, { devServer, startPath });
    context.project = ctx.project;
    if (!native) {
      context.initScript = () => webInitScript(ctx, env);
      return launchedNothing(headless ? await openHeadless(server.url, printLine) : undefined);
    }
    const opts = { env, headless };
    const device = stringFlag(args, "device");
    return platform === "android"
      ? launchAndroid(ctx, artifact, { ...opts, reverse: [server.port], device, avd: stringFlag(args, "avd") })
      : PLATFORM_TARGETS[platform].launch(ctx, artifact, { ...opts, ...(device ? { device } : {}) } as never);
  };
  let app: Launched;
  try {
    app = await launch();
  } catch (error) {
    server.stop();
    throw error;
  }
  log.ok(
    `${native ? "pages from" : "dev server"} ${bold(server.url)}${upstream ? ` → ${upstream}` : " (HMR: React Fast Refresh keeps component state)"}`,
  );
  // Rebuilds only swap config and env; the pages keep coming from Bun.
  flags = { ...flags, "skip-web-build": true };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();
  const rebuild = async (file: string) => {
    log.step(`changed: ${file}, rebuilding`);
    try {
      app.stop();
      await app.exited.catch(() => 0);
      app = await launch();
      log.ok(native ? "relaunched" : "updated (reload the page for the new env)");
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
    }
  };
  const watcher = watch(appDir, (_event, file) => {
    if (!file || !CONFIG_FILE.test(file)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      running = running.then(() => rebuild(file));
    }, 200);
  });
  log.info(dim(`Bun watches the sources; akan-native.config.* and .env* changes rebuild the app (Ctrl+C to stop)`));

  let failure: unknown;
  await new Promise<void>((done) => {
    const off = onStopSignal(() => {
      off();
      done();
    });
    server.exited.catch((error) => {
      failure = error;
      off();
      done();
    });
  });
  watcher.close();
  clearTimeout(timer);
  app.stop();
  // Android: the adb reverse rule goes away once the log stream has ended.
  await Promise.race([app.exited.catch(() => 0), Bun.sleep(3000)]);
  server.stop();
  if (failure) throw failure;
  return 0;
}

/** web --hmr: the browser is the user's (or headless Chrome with --headless). */
function launchedNothing(browser?: { stop(): void; exited: Promise<number> }): Launched {
  let resolveExit!: (code: number) => void;
  const exited = new Promise<number>((resolve) => (resolveExit = resolve));
  return {
    exited,
    stop() {
      browser?.stop();
      resolveExit(0);
    },
  };
}

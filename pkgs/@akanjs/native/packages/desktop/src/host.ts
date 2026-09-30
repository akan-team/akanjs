// The plugin host Worker of a desktop app (docs/architecture.md §3.3).
//
// Native code wakes this Worker through a threadsafe JSCallback (no data), the Worker drains
// the native queue with akan_native_poll, runs plugins and answers with akan_native_respond.
// Rules verified in docs/research/desktop-macos.md §1 Q3:
// - a Worker with an empty event loop exits, and calling its dead JSCallback segfaults the
//   process → keep the loop alive and clear the wake callback on exit
// - an uncaught exception ends the Worker silently (main is blocked) → catch everything

import { JSCallback } from "bun:ffi";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, watch } from "node:fs";
import { extname, join, sep } from "node:path";
import { ID_FILE_REF } from "../../core/src/contract.ts";
import type { AppInfo, ErrorCode } from "../../core/src/index.ts";
import { AkanNativeError, aclCheck, loadAcl } from "../../core/src/index.ts";
import { CONSOLE_PLUGIN, ERROR_CODES, errorResponse, HOST_PLUGIN } from "../../core/src/protocol.ts";
import { linkArguments, registerDeepLinks } from "./deeplinks.ts";
import { createDispatcher } from "./dispatcher.ts";
import { cstr, FRAME_EVENT, FRAME_HEADER, FRAME_IPC, openNative, resolvePaths } from "./ffi.ts";
import { createLifecycle } from "./lifecycle.ts";
import { appDataDir, appLocalDataDir, reservedDirs, serverDataDir } from "./paths.ts";
import { type DesktopPlugin, useShellOpenLimit } from "./plugin.ts";
import { nextRelaunchDelay, relaunchAfterExit } from "./relaunch.ts";
import {
  createDesktopServer,
  createServerStatus,
  envValue,
  pathWithFirst,
  readServerManifest,
  type ServerManifest,
} from "./server.ts";

declare const self: Worker;

/** A drain handles at most this many frames, or runs this long, before it yields (see drain). */
export const DRAIN_FRAMES = 256;
export const DRAIN_MS = 4;

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const JSON_TYPE = cstr("application/json");

interface NativeEvent {
  type: string;
  event?: string;
  url?: string;
  id?: number;
  ok?: boolean;
  result?: unknown;
  error?: string;
  [key: string]: unknown;
}

/**
 * A failed shell op. Ops may name the error code first ("UNSUPPORTED: no tray on this desktop");
 * other messages are about the arguments.
 */
export function shellError(message: string): AkanNativeError {
  const m = /^([A-Z_]+): ([\s\S]*)$/.exec(message);
  return m && ERROR_CODES.includes(m[1] as ErrorCode)
    ? new AkanNativeError(m[1] as ErrorCode, m[2]!)
    : new AkanNativeError("INVALID_ARGS", message);
}

export function startHost(plugins: DesktopPlugin[]): void {
  const paths = resolvePaths();
  //? A Worker keeps its own copy of process.env, and Bun.spawn without `env` ignores it anyway: the server launcher
  //? and plugins that pass process.env get the app's executables first.
  const binDir = existsSync(join(paths.resources, "bin")) ? join(paths.resources, "bin") : null;
  if (binDir) {
    //? One name for it from here on: a second PATH beside Windows' `Path` would hide the system's from a child.
    const path = envValue(process.env, "PATH");
    for (const name of Object.keys(process.env)) if (name.toUpperCase() === "PATH") delete process.env[name];
    process.env.PATH = pathWithFirst(binDir, path);
  }
  const lib = openNative(paths.lib);
  const native = lib.symbols;
  // One limit for every external open (L0): the page's links (shell) and the plugins' (here).
  useShellOpenLimit(() => native.akan_native_external_open_allowed() === 1);
  const boot = JSON.parse(readFileSync(join(paths.resources, "boot.json"), "utf8")) as {
    app: AppInfo;
    dev?: boolean;
    acl?: unknown;
    plugins?: Record<string, unknown>;
  };
  // A malformed ACL denies every call (fail-closed, acl.ts loadAcl); none means everything is allowed.
  const { acl, problem: aclProblem } = loadAcl(boot);
  if (aclProblem)
    console.error(
      `[akan-native] boot.json: the capabilities cannot be read (${aclProblem}); every plugin call is denied`,
    );

  const emitJs = (window: number, js: string) => native.akan_native_emit(window, cstr(js));

  // Windows (SH-6), from native events: which exist, and by last focus (most recent first).
  const windows = new Set<number>([1]);
  let focusOrder: number[] = [1];
  const trackWindows = (event: NativeEvent) => {
    const window = typeof event.window === "number" ? event.window : 1;
    if (event.type !== "window") return;
    if (event.event === "created") windows.add(window);
    else if (event.event === "destroyed") {
      windows.delete(window);
      focusOrder = focusOrder.filter((w) => w !== window);
    } else if (event.event === "focused" && event.value === true)
      focusOrder = [window, ...focusOrder.filter((w) => w !== window)];
  };

  /** Web content processes that ended (the self-test's $host.gone). */
  let gone = 0;
  /** $host.hang calls that were cancelled (the self-test's cancel check). */
  let cancels = 0;
  /** FileRefs served now (K13). */
  const fileIds = new Set<string>();

  // Shell commands (window plugin, …) are answered by "shellReply" events.
  let shellSeq = 0;
  const shellPending = new Map<number, { resolve(v: unknown): void; reject(e: unknown): void }>();
  const nativeListeners = new Map<string, Set<(event: NativeEvent) => void>>();
  const shell = (op: string, args: Record<string, unknown> = {}) => {
    const id = ++shellSeq;
    return new Promise<unknown>((resolve, reject) => {
      shellPending.set(id, { resolve, reject });
      native.akan_native_shell(BigInt(id), cstr(JSON.stringify({ ...args, op })));
    });
  };

  // Quit and close sequence (plugins.md D4). shell.json carries desktop.quitOnLastWindowClosed.
  const shellConfig = JSON.parse(readFileSync(join(paths.resources, "shell.json"), "utf8")) as {
    quitOnLastWindowClosed?: boolean;
    deepLinks?: string[];
    externalSchemes?: string[];
    recovery?: "errorPage" | "reload";
  };
  const deepLinkSchemes = (shellConfig.deepLinks ?? []).map((s) => s.toLowerCase());
  // D6 on Windows and Linux (deeplinks.ts): a link is a launch argument, delivered like macOS's Event::Opened.
  const openLinks = (args: readonly string[]) => {
    const urls = linkArguments(args, deepLinkSchemes);
    if (urls.length) onEvent({ type: "opened", urls });
  };
  const lifecycle = createLifecycle({
    quitOnLastWindowClosed: shellConfig.quitOnLastWindowClosed !== false,
    exit(code) {
      dispatcher.reset();
      native.akan_native_quit(code);
    },
    cancelSessionEnd: () => native.akan_native_quit_cancel(),
    hideWindow: (window) => shell("window.hide", { window }),
    destroyWindow: (window) => shell("window.destroy", { window }),
    windows: async () => ((await shell("window.list")) as { id: number }[]).map((w) => w.id),
  });

  const reserved = reservedDirs(boot.app.id);
  // Read before the plugins' setup, which may ask whether the app carries a server (ctx.server).
  let manifest: ServerManifest | null = null;
  let manifestProblem: unknown;
  try {
    manifest = readServerManifest(paths.resources);
  } catch (error) {
    manifestProblem = error;
  }
  const serverStatus = manifest !== null || manifestProblem !== undefined ? createServerStatus() : null;
  const dispatcher = createDispatcher(
    plugins,
    {
      app: boot.app,
      dev: boot.dev === true,
      appDataDir: appDataDir(boot.app.id),
      appLocalDataDir: appLocalDataDir(boot.app.id),
      binDir,
      server: serverStatus?.status ?? null,
      emit(window, message) {
        emitJs(window, `window.__AKAN_NATIVE__&&window.__AKAN_NATIVE__.receive(${JSON.stringify(message)})`);
      },
      builtins: {
        // Page console forwarding (dev builds, WV-3): print, do not dispatch.
        //? One stream and one tag per line, `[page<+><#window> <level>]`: the akan CLI reads the level back from it
        //? (devkit NativeAppLine), and `+` keeps a stack trace's lines with the message they belong to.
        [CONSOLE_PLUGIN](req, window) {
          const message = (req.args as { message?: string } | undefined)?.message ?? "";
          const scope = window === 1 ? "" : `#${window}`;
          const lines = message.replace(/\n+$/, "").split("\n");
          console.info(lines.map((line, i) => `[page${i === 0 ? "" : "+"}${scope} ${req.method}] ${line}`).join("\n"));
        },
        // Shell built-ins the page runtime calls (window.print, plugins.md D8), and the self-test's echo.
        async [HOST_PLUGIN](req, window, signal) {
          if (req.method === "print") {
            if (!aclCheck(acl, "core", "print", window).allowed) {
              throw new AkanNativeError(
                "NOT_ALLOWED",
                "window.print() is not allowed by the app's capabilities (core:deny-print)",
              );
            }
            await shell("webview.print", { window });
            return;
          }
          if (req.method === "crash" && boot.dev) {
            // Dev builds: ends this window's web content process (N2); the shell loads the page again.
            setTimeout(
              () =>
                void shell("webview.crashForTest", { window }).catch((e: unknown) =>
                  console.error("[akan-native] crash for test:", e),
                ),
              100,
            );
            return;
          }
          if (req.method === "gone" && boot.dev) return { count: gone };
          // Dev builds: a burst of coalescing $host.tick events, then the answer (the coalesce check).
          if (req.method === "burst" && boot.dev) {
            const count = Number((req.args as { count?: number } | undefined)?.count ?? 0);
            for (let n = 0; n < count; n++) dispatcher.emitTo(window, HOST_PLUGIN, "tick", { n });
            return { sent: count };
          }
          // Dev builds: the shell's wake budget counters (the self-test's K-idle check).
          if (req.method === "stats" && boot.dev) return await shell("debug.stats");
          // Dev builds: never answers by itself; counts its cancellation (v1.1 cancel check).
          if (req.method === "hang" && boot.dev)
            return new Promise((resolve) =>
              signal.addEventListener("abort", () => resolve((cancels++, undefined)), { once: true }),
            );
          // Dev builds: table sizes for the document churn check (K13).
          if (req.method === "info" && boot.dev) {
            let listeners = 0;
            for (const set of nativeListeners.values()) listeners += set.size;
            return {
              windows: windows.size,
              cancels,
              stats: { ...dispatcher.stats(), files: fileIds.size, nativeListeners: listeners },
            };
          }
          if (req.method === "echo" && boot.dev) {
            // Dev builds: answers, then sends an event right after the answer (the bridge order check).
            setTimeout(() => dispatcher.emitTo(window, HOST_PLUGIN, "echo", req.args), 0);
            return req.args;
          }
          throw new AkanNativeError("NOT_FOUND", `unknown host method ${req.method}`);
        },
      },
      focusOrder: () => focusOrder.filter((w) => windows.has(w)),
      registerFile(path, mime) {
        // L4: only regular files, and never the app's own storage (paths.ts reservedDirs).
        const real = realpathSync(path);
        if (!statSync(real).isFile()) throw new AkanNativeError("INVALID_ARGS", `${path} is not a file`);
        const inside = (dir: string, p: string) => p === dir || p.startsWith(dir + sep);
        for (const { root, except } of reserved) {
          const r = existsSync(root) ? realpathSync(root) : root;
          if (inside(r, real) && !except.some((e) => inside(existsSync(e) ? realpathSync(e) : e, real))) {
            throw new AkanNativeError("NOT_ALLOWED", `${path} is in the app's own storage and cannot be served`);
          }
        }
        // ASCII letters and digits only: the route accepts no other id (kernel isFileRefId).
        const ext = [...extname(path).slice(1)]
          .filter((c) => ID_FILE_REF.extChars.includes(c))
          .join("")
          .slice(0, ID_FILE_REF.extMax);
        const id = randomBytes(12).toString("base64url") + (ext ? `.${ext}` : "");
        // The checked location, not the given path: a link along the path could change afterwards.
        native.akan_native_register_file(cstr(id), cstr(real), cstr(mime));
        fileIds.add(id);
        return { url: `/__akan_native/file/${id}`, mime, size: statSync(real).size };
      },
      releaseFile(url) {
        const id = /^(?:app:\/\/localhost)?\/__akan_native\/file\/([^/?#]+)$/.exec(url)?.[1];
        if (id === undefined || native.akan_native_unregister_file(cstr(id)) !== 1) return false;
        fileIds.delete(id);
        return true;
      },
      shell,
      deepLinkSchemes,
      externalSchemes: shellConfig.externalSchemes ?? [],
      openLinks,
      onNativeEvent(type, listener) {
        let set = nativeListeners.get(type);
        if (!set) {
          set = new Set();
          nativeListeners.set(type, set);
        }
        set.add(listener);
        return () => set!.delete(listener);
      },
      lifecycle,
    },
    { acl, declarations: boot.plugins },
  );

  const respond = (reqId: bigint, status: number, body: unknown) => {
    const bytes = encoder.encode(JSON.stringify(body));
    native.akan_native_respond(reqId, status, JSON_TYPE, bytes, bytes.length);
  };

  const onIpc = async (reqId: bigint, body: Uint8Array, window: number) => {
    respond(reqId, 200, await dispatcher.handle(decoder.decode(body), window));
  };

  //? The shell takes an op only once akan_native_run runs, after the launch phase: an alert raised before that (a
  //? server that cannot start) waits for the first frame the shell sends. An event the host makes itself (a cold
  //? start's deep link, openLinks) may come before akan_native_run and says nothing about the shell.
  let shellRunning = false;
  const heldAlerts: string[] = [];
  const shellStarted = () => {
    shellRunning = true;
    for (const message of heldAlerts.splice(0)) serverAlert(message);
  };

  // Once per process: the browser process ends for every window at once, and each window reports it.
  let browserExitHandled = false;
  const relaunchAfterBrowserExit = () => {
    if (browserExitHandled) return;
    browserExitHandled = true;
    const delayMs = nextRelaunchDelay(join(appLocalDataDir(boot.app.id), "akan-native-relaunch.json"));
    if (delayMs === null) {
      console.error("[akan-native] the webview's browser process kept ending after each relaunch; the app stops here");
      void lifecycle.quit(1);
      return;
    }
    relaunchAfterExit(process.execPath, [], { delayMs })
      .then(() => lifecycle.quit(0))
      .catch((error: unknown) => console.error("[akan-native] cannot relaunch the app", error));
  };

  const onEvent = (event: NativeEvent) => {
    if (event.type === "shellReply" && typeof event.id === "number") {
      const pending = shellPending.get(event.id);
      shellPending.delete(event.id);
      if (event.ok) pending?.resolve(event.result);
      else pending?.reject(shellError(String(event.error)));
      return;
    }
    trackWindows(event);
    // A snapshot: a listener may add or remove listeners (a source that stops itself).
    for (const listener of [...(nativeListeners.get(event.type) ?? [])]) {
      try {
        listener(event);
      } catch (error) {
        console.error(`[akan-native] native event listener for ${event.type} failed`, error);
      }
    }
    const window = typeof event.window === "number" ? event.window : 1;
    if (event.type === "pageLoad" && event.event === "started") dispatcher.reset(window);
    // The page's web content process ended (N2): its document is gone; the shell loads it again.
    else if (event.type === "webview" && event.event === "processTerminated") {
      gone++;
      console.error(`[akan-native] window ${window}: the page's process ended (${String(event.reason)})`);
      dispatcher.reset(window);
      // desktop.recovery "reload": every window lost its page for good; the shell quits by itself if this fails.
      if (event.reason === "browserExited" && shellConfig.recovery === "reload") relaunchAfterBrowserExit();
    } else if (event.type === "window" && event.event === "destroyed") dispatcher.reset(window);
    else if (event.type === "window" && event.event === "closeRequested") void lifecycle.closeRequested(window);
    else if (event.type === "quitRequested")
      void lifecycle.requestQuit(event.reason === "session" ? "session" : "user");
    // SIGTERM (lib.rs sigterm): no veto, but the onQuit hooks run (window-state, single-instance).
    else if (event.type === "signal") void lifecycle.quit(0);
    else if (event.type === "external") console.info(`[akan-native] opened in the browser: ${event.url}`);
  };

  let buffer = new Uint8Array(64 * 1024);
  // A drain yields after DRAIN_FRAMES frames or DRAIN_MS so that timers, promise reactions and the
  // answers it started run in between (architecture review stage 5). akan_native_poll clears the wake flag,
  // so the rest is picked up by a continuation, not by the next wake.
  let continuation: ReturnType<typeof setTimeout> | null = null;
  const drain = () => {
    const started = performance.now();
    for (let frames = 0; ; frames++) {
      if (frames >= DRAIN_FRAMES || performance.now() - started > DRAIN_MS) {
        continuation ??= setTimeout(() => {
          continuation = null;
          drain();
        }, 0);
        return;
      }
      const size = native.akan_native_poll(buffer, buffer.length);
      if (size === 0) return;
      if (size > buffer.length) {
        buffer = new Uint8Array(Math.max(size, buffer.length * 2));
        continue;
      }
      if (!shellRunning) shellStarted();
      const view = new DataView(buffer.buffer, buffer.byteOffset, size);
      const kind = view.getUint8(0);
      const reqId = view.getBigUint64(1, true);
      const webview = view.getUint32(9, true);
      const body = buffer.slice(FRAME_HEADER, size); // copy: the buffer is reused
      try {
        if (kind === FRAME_IPC) {
          onIpc(reqId, body, webview || 1).catch((error) => {
            console.error("[akan-native] bridge call failed", error);
            respond(reqId, 500, errorResponse(0, "INTERNAL", String(error)));
          });
        } else if (kind === FRAME_EVENT) {
          onEvent(JSON.parse(decoder.decode(body)));
        }
      } catch (error) {
        // One bad message must not end the drain (or the Worker).
        console.error("[akan-native] native message failed", error);
        if (kind === FRAME_IPC) respond(reqId, 500, errorResponse(0, "INTERNAL", String(error)));
      }
    }
  };

  const wake = new JSCallback(drain, { args: [], returns: "void", threadsafe: true });
  native.akan_native_set_wake(wake.ptr);

  process.on("exit", () => native.akan_native_set_wake(null)); // never leave a dead callback behind
  process.on("uncaughtException", (error) =>
    console.error("[akan-native] uncaught exception in the plugin host", error),
  );
  process.on("unhandledRejection", (error) =>
    console.error("[akan-native] unhandled rejection in the plugin host", error),
  );
  // akan-native dev: the CLI rewrites Resources/app in place; reload the page when it does.
  if (boot.dev && process.env.AKAN_NATIVE_DEV_WATCH === "1") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(paths.appDir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const window of windows) emitJs(window, "location.reload()");
      }, 150);
    });
  }
  // JSCallback does not keep the event loop alive.
  setInterval(() => {}, 2 ** 31 - 1);
  const serverAlert = (message: string) => {
    if (!shellRunning) {
      heldAlerts.push(message);
      return;
    }
    void shell("alert.show", {
      title: boot.app.name,
      message,
      buttons: [{ title: "OK" }],
      tag: "akan-server",
    }).catch((error: unknown) => console.error("[akan-native] cannot show the server alert", error));
  };
  //? A page of an app that carries a server always gets a loopback URL, even one nothing answers: without it the page
  //? would call the backend its bundle was built for, and a desktop app would read and write another copy's data.
  const startServer = async (): Promise<Record<string, string> | undefined> => {
    if (!serverStatus) return undefined;
    const dataDir = serverDataDir(boot.app.id, boot.dev === true);
    try {
      if (!manifest) throw manifestProblem;
      const server = createDesktopServer({
        resources: paths.resources,
        dataDir,
        manifest,
        binDir,
        onGiveUp: serverAlert,
        onState: serverStatus.setState,
      });
      void server.ready.then(serverStatus.settle);
      lifecycle.onQuit(() => server.stop());
      const { url, ready } = await server.start();
      console.info(`[akan-native] server ${ready ? "ready" : "not ready"} on ${url}`);
      return { PUBLIC_AKAN_SERVER_URL: url };
    } catch (error) {
      console.error("[akan-native] the app's server could not start", error);
      serverStatus.settle(false);
      serverStatus.setState("gaveUp");
      serverAlert(`The app's server cannot start: ${error instanceof Error ? error.message : String(error)}`);
      return { PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:0" };
    }
  };
  // The main thread creates the window (or exits) once the launch phase is over. The server starts
  // after it: a second instance handing over to the first (single-instance) must not open its data.
  void dispatcher.launched
    .then(async (launch) => {
      const env = typeof launch.exit === "number" ? undefined : await startServer();
      self.postMessage({ type: "ready", ...launch, ...(env ? { env } : {}) });
      if (typeof launch.exit === "number") return;
      // A cold start by deep link (Windows, Linux); the app plugin keeps it for the page (C2).
      openLinks(process.argv.slice(2));
      registerDeepLinks(boot.app, deepLinkSchemes).catch((error) =>
        console.warn("[akan-native] cannot register the deep link schemes", error),
      );
    })
    .catch((error: unknown) => console.error("[akan-native] the launch phase failed", error));
}

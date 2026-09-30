// The server a desktop app carries (akanjs `native.desktop.server`; docs/architecture.md §3.3).
// resources/server holds its files and resources/server.json its entry and env. The plugin host
// starts it as a child of this executable run as Bun (BUN_BE_BUN), on a loopback port fixed for the
// session: the page's init script names the port and is fixed at akan_native_run. The main thread
// cannot own the child, since no JavaScript runs there after that call.
//
// - The child gets none of the shell's environment but a few system variables: an app started by
//   `akan start-desktop` carries the CLI's AKAN_PUBLIC_*, PORT and the like. The app's own bin folder
//   comes first on its PATH, a PATH in server.json included.
// - Bun as a CLI reads .env and bunfig.toml from its working folder (<server data>, writable by
//   any process of the user) and installs missing packages; the flags turn all three off. It trusts
//   only its own CA list unless told to use the system's, which is where an organisation's CAs are.
// - The port of the last session comes first, so a URL registered somewhere stays valid while it is
//   free. A server that exits before its first ready, while the page has not been handed its URL,
//   is started again on that port if it is still free, else on a fresh one: another program may have taken it.
// - A crash restarts it on the same port, 1 s → 30 s apart; MAX_FAILURES in a row give up. Before its first
//   ready it is restarted BOOT_RESTART_DELAY apart, so a server that cannot boot gives up while the window
//   still waits for it (READY_TIMEOUT) and the page opens with the alert, not with a URL nobody answers.
// - A `file.resolve` request names a grant the file picker gave the page (forServer); the answer is
//   the path the user picked, or an error for a grant this app never gave (grants.ts).
// - Quit: an IPC shutdown, then SIGKILL after STOP_GRACE. If the shell dies first, the child sees its
//   IPC channel close and stops itself (akanjs AkanServer); on Windows the job object ends it at once.
// - macOS and Linux: the server leads its own process group, and whatever it started that is still
//   there once it exited is ended with it (Windows: the job object).
// - Its standard error, and its standard output until it is ready, also go to <server data>/runtime/logs/
//   server-output.log: a server that fails before it listens has written nothing to its own log file yet.

import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { connect, createServer } from "node:net";
import { join } from "node:path";
import { resolveGrant } from "./grants.ts";
import type { DesktopServerState, DesktopServerStatus } from "./plugin.ts";

export interface ServerManifest {
  /** The file in resources/server that starts the server. */
  entry: string;
  env: Record<string, string>;
}

/** Set by the launcher at every start, so desktop.server.env may not name them (cli lib/desktop-server.ts). */
export const LAUNCHER_ENV_KEYS = [
  "BUN_BE_BUN",
  "BUN_RUNTIME_TRANSPILER_CACHE_PATH",
  "PORT",
  "JWT_SECRET",
  "AKAN_LISTEN_HOST",
  "AKAN_ALLOWED_HOSTS",
  "AKAN_SQLITE_DIR",
  "AKAN_WORKSPACE_ROOT",
  "AKAN_RUNTIME_DIR",
] as const;

const SYSTEM_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "TZ",
  "SystemRoot",
  "WINDIR",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_RUNTIME_DIR",
  //? The desktop session, for a `bin` tool that opens the screen, the audio server or the session bus. An X
  //? display of a GDM session refuses a client without its XAUTHORITY cookie.
  "DISPLAY",
  "XAUTHORITY",
  "WAYLAND_DISPLAY",
  "DBUS_SESSION_BUS_ADDRESS",
  "PULSE_SERVER",
  "PULSE_COOKIE",
  "PULSE_RUNTIME_PATH",
  "XDG_SESSION_TYPE",
  "XDG_CURRENT_DESKTOP",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_DATA_DIRS",
  "SystemDrive",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "ProgramW6432",
  "CommonProgramFiles",
  "PATHEXT",
  "ComSpec",
  "PSModulePath",
  "USERNAME",
  "USERDOMAIN",
  "COMPUTERNAME",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "NODE_USE_SYSTEM_CA",
  "SSL_CERT_FILE",
];

/** How long the window waits for the server; after that it opens and the first calls may fail. */
export const READY_TIMEOUT = 8000;
/** Within the onQuit budget (lifecycle.ts QUIT_HOOK_TIMEOUT, 2 s). */
export const STOP_GRACE = 1500;
export const MAX_FAILURES = 5;
/** Between restarts of a server that has not been ready yet: MAX_FAILURES of them end well within READY_TIMEOUT. */
export const BOOT_RESTART_DELAY = 250;
/** A run that stayed up this long was healthy: its crash starts the count again. */
export const HEALTHY_RUN = 60_000;
/** server-output.log moves to server-output.log.1 past this size. */
export const OUTPUT_LOG_LIMIT = 1 << 20;

export interface ServerProcess {
  readonly exited: Promise<number | null>;
  send(message: unknown): void;
  kill(signal?: NodeJS.Signals): void;
  /** Signals what is left of the server's process group (macOS, Linux). */
  killGroup?(signal: NodeJS.Signals): void;
}

export interface SpawnOptions {
  cwd: string;
  env: Record<string, string>;
  onMessage(message: unknown): void;
  onLine(line: string, stream: "stdout" | "stderr"): void;
}

export interface DesktopServerOptions {
  resources: string;
  /** Where the server keeps everything: its working folder, databases, logs, secret (paths.ts serverDataDir). */
  dataDir: string;
  manifest: ServerManifest;
  /** The app's executables (resources/bin), first on the server's PATH. */
  binDir?: string | null;
  execPath?: string;
  env?: Record<string, string | undefined>;
  spawn?(argv: string[], options: SpawnOptions): ServerProcess;
  /** A free loopback port: `preferred` when it is free. */
  freePort?(preferred?: number): Promise<number>;
  /** The server gave up: MAX_FAILURES crashes in a row, or it could not start at all. */
  onGiveUp?(message: string): void;
  /** Every change of `state`. */
  onState?(state: DesktopServerState): void;
  readyTimeout?: number;
  stopGrace?: number;
  restartDelay?(failures: number, everReady: boolean): number;
  now?(): number;
}

export interface DesktopServer {
  /**
   * The server's URL, once it is ready or readyTimeout passed (it keeps starting then), or at once when it gave up.
   * Never throws: a server that cannot start still has a loopback URL, so the page's calls fail on this PC.
   */
  start(): Promise<{ url: string; ready: boolean }>;
  /** Settles once: true at the first ready, false when the server gave up or stopped before that. */
  readonly ready: Promise<boolean>;
  /** Where the server is now; `ready` only tells the first answer. */
  readonly state: DesktopServerState;
  stop(): Promise<void>;
}

/** What plugins see of the server (ctx.server) from their setup on: the plugin host starts it only after that. */
export function createServerStatus() {
  let settle = (_ready: boolean) => {};
  const ready = new Promise<boolean>((resolve) => (settle = resolve));
  let state: DesktopServerState = "starting";
  const listeners = new Set<(state: DesktopServerState) => void>();
  const status: DesktopServerStatus = {
    ready,
    get state() {
      return state;
    },
    onState(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  const setState = (next: DesktopServerState) => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch (error) {
        console.error("[akan-native] a server state listener failed", error);
      }
    }
  };
  return { status, settle: (value: boolean) => settle(value), setState };
}

export function readServerManifest(resources: string): ServerManifest | null {
  const file = join(resources, "server.json");
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as { entry?: unknown; env?: unknown };
  if (typeof raw.entry !== "string" || !raw.entry) throw new Error(`${file}: entry must name a file`);
  const env = Object.fromEntries(
    Object.entries((raw.env ?? {}) as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  return { entry: raw.entry, env };
}

export function serverArgv(execPath: string, resources: string, entry: string): string[] {
  return [
    execPath,
    "--no-env-file",
    "--no-install",
    "--use-system-ca",
    `--config=${join(resources, "server.bunfig.toml")}`,
    join(resources, "server", entry),
  ];
}

/**
 * `key`'s value in `env`. Windows names a variable in any case (`Path`), and the plugin host's copy of process.env
 * matches a name only in the case it has, where the process's own env ignores case.
 */
export function envValue(
  env: Record<string, string | undefined>,
  key: string,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (env[key] !== undefined || platform !== "win32") return env[key];
  const name = Object.keys(env).find((candidate) => candidate.toUpperCase() === key.toUpperCase());
  return name === undefined ? undefined : env[name];
}

/** `dir` first on a PATH, once: a relaunched app inherits the PATH its predecessor already extended. */
export function pathWithFirst(
  dir: string,
  path: string | undefined,
  platform: NodeJS.Platform = process.platform,
): string {
  if (!path) return dir;
  const separator = platform === "win32" ? ";" : ":";
  const [first] = path.split(separator);
  const same = platform === "win32" ? first?.toLowerCase() === dir.toLowerCase() : first === dir;
  return same ? path : `${dir}${separator}${path}`;
}

export function serverEnv(
  manifest: ServerManifest,
  {
    port,
    secret,
    dataDir,
    env,
    binDir = null,
    platform = process.platform,
  }: {
    port: number;
    secret: string;
    dataDir: string;
    env: Record<string, string | undefined>;
    binDir?: string | null;
    platform?: NodeJS.Platform;
  },
): Record<string, string> {
  const system: Record<string, string> = {};
  for (const key of SYSTEM_ENV_KEYS) {
    const value = envValue(env, key, platform);
    if (value === undefined) continue;
    //? Windows variables have one name whatever its case: http_proxy is HTTP_PROXY, twice in one block.
    if (platform === "win32" && Object.keys(system).some((k) => k.toUpperCase() === key.toUpperCase())) continue;
    system[key] = value;
  }
  if (platform === "win32")
    for (const key of Object.keys(manifest.env))
      for (const name of Object.keys(system)) if (name.toUpperCase() === key.toUpperCase()) delete system[name];
  const merged = { ...system, ...manifest.env };
  return {
    ...merged,
    ...(binDir ? { PATH: pathWithFirst(binDir, merged.PATH, platform) } : {}),
    BUN_BE_BUN: "1",
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(dataDir, "runtime", "transpiler-cache"),
    PORT: String(port),
    AKAN_LISTEN_HOST: "127.0.0.1",
    AKAN_ALLOWED_HOSTS: `127.0.0.1:${port},localhost:${port}`,
    JWT_SECRET: secret,
    AKAN_SQLITE_DIR: join(dataDir, "db"),
    AKAN_WORKSPACE_ROOT: dataDir,
    AKAN_RUNTIME_DIR: join(dataDir, "runtime"),
  };
}

/** One random secret per installation, readable by its owner only: outside operationMode local akanjs derives none. */
export function jwtSecret(dataDir: string): string {
  const file = join(dataDir, "jwt.secret");
  if (existsSync(file)) {
    const kept = readFileSync(file, "utf8").trim();
    if (kept) {
      //? A file an older build or a copy left group- or world-readable is narrowed too (a no-op on Windows,
      //? where the folder in the user's profile is what keeps other accounts out).
      try {
        chmodSync(file, 0o600);
      } catch {
        // Not this user's file: reading it worked, and narrowing it is not ours to do.
      }
      return kept;
    }
  }
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, secret, { mode: 0o600 });
  chmodSync(file, 0o600);
  return secret;
}

export function restartDelay(failures: number, everReady = true): number {
  return everReady ? Math.min(1000 * 2 ** (failures - 1), 30_000) : BOOT_RESTART_DELAY;
}

const listenOn = (port: number) =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => {
      const address = probe.address();
      const bound = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (bound ? resolve(bound) : reject(new Error("no loopback port"))));
    });
  });

const answers = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const done = (answered: boolean) => {
      socket.destroy();
      resolve(answered);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });

//? macOS and Windows let 127.0.0.1:P bind beside another program's wildcard *:P, whose clients then reach this
//? server instead: a port something already answers on is taken, whatever the bind says.
const loopbackPort = async (preferred?: number) => {
  const kept = preferred && !(await answers(preferred)) ? await listenOn(preferred).catch(() => 0) : 0;
  return kept || listenOn(0);
};

const validPort = (port: number) => Number.isInteger(port) && port > 0 && port < 65536;

/** The port the last session's server was ready on (`<server data>/port`), if any. */
export function lastPort(dataDir: string): number | undefined {
  try {
    const port = Number(readFileSync(join(dataDir, "port"), "utf8").trim());
    return validPort(port) ? port : undefined;
  } catch {
    return undefined;
  }
}

const pipeLines = async (stream: ReadableStream<Uint8Array>, onLine: (line: string) => void) => {
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of stream) {
    const lines = (pending + decoder.decode(chunk, { stream: true })).split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) onLine(line);
  }
  if (pending) onLine(pending);
};

const spawnServer = (argv: string[], { cwd, env, onMessage, onLine }: SpawnOptions): ServerProcess => {
  const posix = process.platform !== "win32";
  const proc = Bun.spawn(argv, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
    //? Its own session and process group: what it starts can be found and ended after it (killGroup). Never on
    //? Windows, where it would take the server out of the job object that ends it with the app.
    detached: posix,
    ipc: (message) => onMessage(message),
  });
  const logFailure = (error: unknown) => console.error("[akan-native] reading the server's output failed", error);
  pipeLines(proc.stdout, (line) => onLine(line, "stdout")).catch(logFailure);
  pipeLines(proc.stderr, (line) => onLine(line, "stderr")).catch(logFailure);
  return {
    exited: proc.exited,
    send: (message) => proc.send(message),
    kill: (signal) => proc.kill(signal),
    killGroup: posix
      ? (signal) => {
          try {
            process.kill(-proc.pid, signal);
          } catch {
            // ESRCH: nothing is left in the group.
          }
        }
      : undefined,
  };
};

function answerGrant(child: ServerProcess, { id, grant }: { id?: unknown; grant?: unknown }) {
  const found = resolveGrant(grant);
  try {
    child.send(
      found
        ? { type: "file.resolved", id, path: found.path, mode: found.mode }
        : { type: "file.resolved", id, error: "no file was granted under this id" },
    );
  } catch {
    // The server exited after it asked: nobody waits for the answer, and the plugin host must not end with it.
  }
}

export function createDesktopServer(options: DesktopServerOptions): DesktopServer {
  const { dataDir } = options;
  const spawn = options.spawn ?? spawnServer;
  const now = options.now ?? (() => performance.now());
  const pickPort = options.freePort ?? loopbackPort;
  const argv = serverArgv(options.execPath ?? process.execPath, options.resources, options.manifest.entry);
  const grace = options.stopGrace ?? STOP_GRACE;
  const logs = join(dataDir, "runtime", "logs");
  const outputLog = join(logs, "server-output.log");
  let outputSize = -1;
  let env: Record<string, string> = {};
  let secret = "";
  let port = 0;
  let proc: ServerProcess | null = null;
  let stopping = false;
  let gaveUp = false;
  let everReady = false;
  /** The page has the URL: the port no longer moves. */
  let handedOut = false;
  let failures = 0;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  /** Groups of servers that crashed, until their SIGKILL: stop() sends it at once. */
  const crashedGroups = new Set<NonNullable<ServerProcess["killGroup"]>>();
  let settleReady = (_ready: boolean) => {};
  const ready = new Promise<boolean>((resolve) => (settleReady = resolve));
  let state: DesktopServerState = "starting";
  const setState = (next: DesktopServerState) => {
    if (next === state || state === "stopped") return;
    state = next;
    try {
      options.onState?.(next);
    } catch (error) {
      console.error("[akan-native] the server's state handler failed", error);
    }
  };

  const record = (line: string) => {
    try {
      if (outputSize < 0) {
        mkdirSync(logs, { recursive: true });
        outputSize = existsSync(outputLog) ? statSync(outputLog).size : 0;
      }
      if (outputSize > OUTPUT_LOG_LIMIT) {
        renameSync(outputLog, `${outputLog}.1`);
        outputSize = 0;
      }
      const text = `${new Date().toISOString()} ${line}\n`;
      appendFileSync(outputLog, text);
      outputSize += Buffer.byteLength(text);
    } catch {
      // The console still has the line.
    }
  };

  const configure = () => {
    env = serverEnv(options.manifest, {
      port,
      secret,
      dataDir,
      env: options.env ?? process.env,
      binDir: options.binDir,
    });
  };

  const giveUp = (message: string) => {
    gaveUp = true;
    settleReady(false);
    setState("gaveUp");
    record(`[akan-native] ${message}`);
    try {
      options.onGiveUp?.(message);
    } catch (error) {
      console.error("[akan-native] the server's give-up handler failed", error);
    }
  };

  const failed = (why: string) => {
    failures++;
    const line = `[akan-native] the server ${why} (${failures} of ${MAX_FAILURES} in a row)`;
    console.error(line);
    record(line);
    setState(everReady ? "restarting" : "starting");
    if (failures >= MAX_FAILURES)
      return giveUp(
        `The app's server stopped ${MAX_FAILURES} times in a row and is not restarted again. Its logs are in ${logs}.`,
      );
    restartTimer = setTimeout(() => void launch(), (options.restartDelay ?? restartDelay)(failures, everReady));
  };

  const run = () => {
    let readyAt: number | null = null;
    const child = spawn(argv, {
      cwd: dataDir,
      env,
      onMessage(message) {
        const type = (message as { type?: unknown } | null)?.type;
        if (type === "file.resolve") return answerGrant(child, message as { id?: unknown; grant?: unknown });
        if (type !== "ready" || readyAt !== null) return;
        readyAt = now();
        setState("up");
        if (!everReady) {
          everReady = true;
          settleReady(true);
        }
        try {
          writeFileSync(join(dataDir, "port"), String(port));
        } catch {
          // The next session picks a port of its own.
        }
      },
      onLine: (line, stream) => {
        (stream === "stderr" ? console.error : console.info)(`[server] ${line}`);
        if (stream === "stderr" || readyAt === null) record(line);
      },
    });
    proc = child;
    child.exited.then(
      (code) => {
        if (proc === child) proc = null;
        child.killGroup?.(stopping ? "SIGKILL" : "SIGTERM");
        if (stopping) return;
        const group = child.killGroup;
        if (group) {
          crashedGroups.add(group);
          setTimeout(() => {
            crashedGroups.delete(group);
            group("SIGKILL");
          }, grace).unref?.();
        }
        if (readyAt !== null && now() - readyAt >= HEALTHY_RUN) failures = 0;
        failed(`exited with ${code}`);
      },
      (error: unknown) => console.error("[akan-native] waiting for the server failed", error),
    );
  };

  /** One start of the server; a throw (the data folder removed meanwhile, no processes left) is one failure. */
  const launch = async () => {
    if (stopping || gaveUp) return;
    try {
      if (!everReady && !handedOut && failures > 0) {
        const fresh = await pickPort(port);
        if (stopping || gaveUp) return;
        if (!handedOut && fresh !== port) {
          port = fresh;
          configure();
        }
      }
      mkdirSync(dataDir, { recursive: true });
      run();
    } catch (error) {
      failed(`could not start: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return {
    ready,
    get state() {
      return state;
    },
    async start() {
      const kept = lastPort(dataDir);
      try {
        port = await pickPort(kept);
      } catch (error) {
        port = kept ?? 0;
        console.error("[akan-native] no free loopback port for the server", error);
      }
      try {
        mkdirSync(dataDir, { recursive: true });
        secret = jwtSecret(dataDir);
        configure();
      } catch (error) {
        handedOut = true;
        console.error("[akan-native] the app's server cannot start", error);
        giveUp(
          `The app's server cannot start: ${error instanceof Error ? error.message : String(error)}. Its folder is ${dataDir}.`,
        );
        return { url: `http://127.0.0.1:${port}`, ready: false };
      }
      await launch();
      const timeout = options.readyTimeout ?? READY_TIMEOUT;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), timeout)));
      const answer = await Promise.race([ready, late]);
      clearTimeout(timer);
      handedOut = true;
      if (!answer && !gaveUp)
        console.warn(`[akan-native] the server is not ready after ${timeout} ms; opening the window anyway`);
      return { url: `http://127.0.0.1:${port}`, ready: answer };
    },
    async stop() {
      stopping = true;
      clearTimeout(restartTimer);
      settleReady(false);
      setState("stopped");
      for (const group of crashedGroups) group("SIGKILL");
      crashedGroups.clear();
      const child = proc;
      if (!child) return;
      try {
        child.send({ type: "shutdown", signal: "SIGTERM" });
      } catch {
        // The channel closed with the child: exited is settling on its own.
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), grace)));
      const done = await Promise.race([child.exited.then(() => true), late]);
      clearTimeout(timer);
      if (!done) child.kill("SIGKILL");
      child.killGroup?.("SIGKILL");
    },
  };
}

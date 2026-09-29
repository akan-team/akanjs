// The server a desktop app carries (akanjs `build-desktop --server`; docs/architecture.md §3.3).
// resources/server holds its files and resources/server.json its entry and env. The plugin host
// starts it as a child of this executable run as Bun (BUN_BE_BUN), on a loopback port picked once
// per session: the page's init script names the port and is fixed at akan_native_run. The main
// thread cannot own the child, since no JavaScript runs there after that call.
//
// - The child gets none of the shell's environment but a few system variables: an app started by
//   `akan start-desktop` carries the CLI's AKAN_PUBLIC_*, PORT and the like. PATH is one of them, so the
//   app's own bin folder, which main.ts put first on it, comes first for the server too.
// - Bun as a CLI reads .env and bunfig.toml from its working folder (<app data>/server, writable by
//   any process of the user) and installs missing packages; the flags turn all three off.
// - A crash restarts it on the same port, 1 s → 30 s apart; MAX_FAILURES in a row give up.
// - A `file.resolve` request names a grant the file picker gave the page (forServer); the answer is
//   the path the user picked, or an error for a grant this app never gave (grants.ts).
// - Quit: an IPC shutdown, then SIGTERM after STOP_GRACE. If the shell dies first, the child sees its
//   IPC channel close and stops itself (akanjs AkanServer); on Windows the job object ends it at once.

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { resolveGrant } from "./grants.ts";

export interface ServerManifest {
  /** The file in resources/server that starts the server. */
  entry: string;
  env: Record<string, string>;
}

/** Set by the launcher at every start, so desktop.server.env may not name them (cli lib/desktop-server.ts). */
export const LAUNCHER_ENV_KEYS = [
  "BUN_BE_BUN",
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
];

/** How long the window waits for the server; after that it opens and the first calls may fail. */
export const READY_TIMEOUT = 8000;
/** Within the onQuit budget (lifecycle.ts QUIT_HOOK_TIMEOUT, 2 s). */
export const STOP_GRACE = 1500;
export const MAX_FAILURES = 5;
/** A run that stayed up this long was healthy: its crash starts the count again. */
export const HEALTHY_RUN = 60_000;

export interface ServerProcess {
  readonly exited: Promise<number | null>;
  send(message: unknown): void;
  kill(signal?: NodeJS.Signals): void;
}

export interface SpawnOptions {
  cwd: string;
  env: Record<string, string>;
  onMessage(message: unknown): void;
  onLine(line: string, stream: "stdout" | "stderr"): void;
}

export interface DesktopServerOptions {
  resources: string;
  /** The app's data folder (paths.ts appDataDir); the server keeps everything in <app data>/server. */
  appDataDir: string;
  manifest: ServerManifest;
  execPath?: string;
  env?: Record<string, string | undefined>;
  spawn?(argv: string[], options: SpawnOptions): ServerProcess;
  freePort?(): Promise<number>;
  /** MAX_FAILURES crashes in a row: the server is not restarted again. */
  onGiveUp?(message: string): void;
  readyTimeout?: number;
  stopGrace?: number;
  restartDelay?(failures: number): number;
  now?(): number;
}

export interface DesktopServer {
  /** The server's URL, once it is ready or readyTimeout passed (it keeps starting then). */
  start(): Promise<{ url: string; ready: boolean }>;
  stop(): Promise<void>;
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
    `--config=${join(resources, "server.bunfig.toml")}`,
    join(resources, "server", entry),
  ];
}

export function serverEnv(
  manifest: ServerManifest,
  {
    port,
    secret,
    dataDir,
    env,
  }: { port: number; secret: string; dataDir: string; env: Record<string, string | undefined> },
): Record<string, string> {
  const system = Object.fromEntries(
    SYSTEM_ENV_KEYS.flatMap((key) => (env[key] === undefined ? [] : [[key, env[key]] as [string, string]])),
  );
  return {
    ...system,
    ...manifest.env,
    BUN_BE_BUN: "1",
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
    if (kept) return kept;
  }
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(file, secret, { mode: 0o600 });
  chmodSync(file, 0o600);
  return secret;
}

export function restartDelay(failures: number): number {
  return Math.min(1000 * 2 ** (failures - 1), 30_000);
}

const loopbackPort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error("no loopback port"))));
    });
  });

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
  const proc = Bun.spawn(argv, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
    ipc: (message) => onMessage(message),
  });
  void pipeLines(proc.stdout, (line) => onLine(line, "stdout"));
  void pipeLines(proc.stderr, (line) => onLine(line, "stderr"));
  return { exited: proc.exited, send: (message) => proc.send(message), kill: (signal) => proc.kill(signal) };
};

function answerGrant(child: ServerProcess, { id, grant }: { id?: unknown; grant?: unknown }) {
  const found = resolveGrant(grant);
  child.send(
    found
      ? { type: "file.resolved", id, path: found.path, mode: found.mode }
      : { type: "file.resolved", id, error: "no file was granted under this id" },
  );
}

export function createDesktopServer(options: DesktopServerOptions): DesktopServer {
  const dataDir = join(options.appDataDir, "server");
  const spawn = options.spawn ?? spawnServer;
  const now = options.now ?? (() => performance.now());
  const argv = serverArgv(options.execPath ?? process.execPath, options.resources, options.manifest.entry);
  let env: Record<string, string> = {};
  let proc: ServerProcess | null = null;
  let stopping = false;
  let failures = 0;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let markReady = () => {};
  const firstReady = new Promise<true>((resolve) => (markReady = () => resolve(true)));

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
        markReady();
      },
      onLine: (line, stream) => (stream === "stderr" ? console.error : console.info)(`[server] ${line}`),
    });
    proc = child;
    void child.exited.then((code) => {
      if (proc === child) proc = null;
      if (stopping) return;
      if (readyAt !== null && now() - readyAt >= HEALTHY_RUN) failures = 0;
      failures++;
      console.error(`[akan-native] the server exited with ${code} (${failures} of ${MAX_FAILURES} in a row)`);
      if (failures >= MAX_FAILURES) {
        options.onGiveUp?.(
          `The app's server stopped ${MAX_FAILURES} times in a row and is not restarted again. Its logs are in ${join(dataDir, "runtime", "logs")}.`,
        );
        return;
      }
      restartTimer = setTimeout(run, (options.restartDelay ?? restartDelay)(failures));
    });
  };

  return {
    async start() {
      mkdirSync(dataDir, { recursive: true });
      const port = await (options.freePort ?? loopbackPort)();
      env = serverEnv(options.manifest, {
        port,
        secret: jwtSecret(dataDir),
        dataDir,
        env: options.env ?? process.env,
      });
      run();
      const timeout = options.readyTimeout ?? READY_TIMEOUT;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), timeout)));
      const ready = await Promise.race([firstReady, late]);
      clearTimeout(timer);
      if (!ready) console.warn(`[akan-native] the server is not ready after ${timeout} ms; opening the window anyway`);
      return { url: `http://127.0.0.1:${port}`, ready };
    },
    async stop() {
      stopping = true;
      clearTimeout(restartTimer);
      const child = proc;
      if (!child) return;
      try {
        child.send({ type: "shutdown", signal: "SIGTERM" });
      } catch {
        // The channel closed with the child: exited is settling on its own.
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<false>(
        (resolve) => (timer = setTimeout(() => resolve(false), options.stopGrace ?? STOP_GRACE)),
      );
      const done = await Promise.race([child.exited.then(() => true), late]);
      clearTimeout(timer);
      if (!done) child.kill("SIGTERM");
    },
  };
}

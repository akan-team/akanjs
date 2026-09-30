// Desktop app updates (UP-1): the whole app is replaced (macOS the .app, Windows and Linux the app
// folder); the same API as the web bundle updates of iOS / Android (UP-2), with the same trial /
// confirm / rollback rules.
//
// - The manifest `<url>/<os>-<arch>/<channel>.json` (e.g. macos-arm64) is signed as a whole
//   (Ed25519, `.sig`); nothing in it is used before the signature checks out, and its `arch` must
//   be this app's (an app for the other CPU would not even start, so it could not roll back).
// - The release is a tar of the app. An app that still has its own release's tar (kept after
//   every update) gets the small delta from that release (@akanjs/native/desktop/delta); otherwise the full
//   gzip archive. Either way the tar's sha256 must match the manifest.
// - It is unpacked next to the app (`<App>.app.update-<bundle>`, same volume, so the swap is a
//   rename: Electrobun extractor/main.zig:7355-7373), checked (app id; macOS `codesign --verify`),
//   flushed to the disk, and swapped in by apply(): <App>.app → <App>.app.previous, the new one →
//   <App>.app, relaunch. Windows does not rename a folder whose program is running, so there a helper
//   (PowerShell, started through cmd.exe to outlive the app) waits for the app to exit, does the renames
//   and starts the result (moveThenRelaunch); a RunOnce value puts back what a shutdown left half moved.
// - The new app runs on trial. notifyReady() within updates.readyTimeout of its page's load confirms
//   it and removes .previous; a timeout, or a second launch without confirming, swaps .previous back
//   and relaunches it. Nothing is applied while a release is on trial: that would replace .previous.
// - An app that carries a server confirms only once that server answered ready and stayed up for
//   SERVER_SETTLE, and while it is up; its clock starts then. A server that gives up, or is not up
//   SERVER_BOOT_ALLOWANCE after the start, rolls the release back at once but fails it only after
//   MAX_STRIKES tries, as a Windows swap that did not happen does: the cause may be this PC's moment
//   (a lock, a scan), so the release stays downloaded for the next apply.
//   Electrobun deletes .previous as soon as the new app launched (main.zig:7811-7818) and Tauri
//   drops its backup when the final rename fails (updater.rs:1429-1476); here the old app stays
//   until the new one said it works.

import { createHash, createPublicKey, verify } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { uptime } from "node:os";
import { basename, dirname, join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { isBundleId } from "../../../packages/core/src/kernel.ts";
import { applyDelta } from "../../../packages/desktop/src/delta.ts";
import {
  type DesktopContext,
  type DesktopPlugin,
  type DesktopServerState,
  type DesktopServerStatus,
  defineDesktopPlugin,
} from "../../../packages/desktop/src/plugin.ts";
import { type RelaunchOptions, relaunchAfterExit } from "../../../packages/desktop/src/relaunch.ts";
import type { UpdateCheck, UpdateState, UpdatesApi, UpdatesEvents } from "./index.ts";

export interface UpdatesConfig {
  app: string;
  platform: string;
  nativeApi: string | null;
  embeddedSequence: number;
  url: string;
  publicKey: string;
  channel: string;
  readyTimeout: number;
}

interface Entry {
  bundle: string;
  sequence: number;
  version: string;
  /** sha256 of the release tar (the base of the next delta). */
  tar: string;
  /** embeddedSequence of that release's app: tells whether the running app is it. */
  build: number;
}

type Trial = Entry & {
  previous: string;
  attempts: number;
  pid?: number;
  boot?: number;
  from?: number;
  staged?: string;
};

interface State {
  current?: Entry;
  pending?: Entry & { staged: string };
  /**
   * `pid` and `boot` (when the system started, s): the process running the trial, so a second instance of the app
   * leaves it alone. `from` (Windows, where a helper swaps after the app exited): the build that applied it, which is
   * still what runs when the swap failed, with the release still at `staged`.
   */
  trial?: Trial;
  failed: string[];
  /** Why each release in `failed` was failed. */
  reasons?: Record<string, string>;
  /** Tries of a release that failed for a reason that may pass (MAX_STRIKES). */
  strikes?: Record<string, number>;
  rolledBack?: string;
  /** A rollback whose moves may not have happened: the failed build, while it still runs, makes them again. */
  rollback?: { build: number; previous: string; to: string; attempts: number };
  /** embeddedSequence of the build installed here: another one means the app was installed again. */
  installed?: number;
}

interface Manifest {
  schema: number;
  kind: string;
  app: string;
  platform: string;
  channel: string;
  sequence: number;
  bundle: string;
  version: string;
  build?: number;
  arch?: string;
  archive?: { sha256: string; url: string; size: number; gzSha256: string };
  patches?: { from: string; url: string; sha256: string; size: number }[];
  /** Whether the release carries a server (resources/server.json); a manifest published before it says nothing. */
  server?: boolean;
}

/**
 * How long a new release's carried server may take to answer ready before its trial clock starts anyway: a first
 * run scans every file with a cold transpiler cache and migrates the databases, on a PC that may be slow. The
 * launcher's own wait (READY_TIMEOUT, 8 s) only decides when the window opens.
 */
export const SERVER_BOOT_ALLOWANCE = 120_000;
/** A server whose init throws answered ready first: its release is confirmed only once it stayed up this long. */
export const SERVER_SETTLE = 5_000;
/** Tries of a release whose server did not come up, or whose Windows swap did not happen, before it is failed. */
export const MAX_STRIKES = 3;

const MAX_MANIFEST = 1 << 20;
const MAX_SIGNATURE = 1024;
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** Whether a process exists (signal 0 only checks; EPERM means it exists but is not ours). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
}

/** When the system started, in seconds: a PID recorded under another boot names another process now. */
const bootTime = () => Math.round(Date.now() / 1000 - uptime());

//? Never whichever tar.exe comes first on PATH: a GNU tar there (Git for Windows) reads "C:" as a remote host.
const tarBinary = () =>
  process.platform === "win32"
    ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
    : (["/usr/bin/tar", "/bin/tar"].find((path) => existsSync(path)) ?? "tar");

/** fsync of a file, or of a folder on macOS and Linux; Windows flushes only a handle opened for writing. */
function flush(path: string, folder = false): void {
  if (folder && process.platform === "win32") return;
  let fd: number | undefined;
  try {
    fd = openSync(path, folder || process.platform !== "win32" ? "r" : "r+");
    fsyncSync(fd);
  } catch {
    // Best effort: what cannot be opened for it is as durable as the OS makes it anyway.
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** An unpacked release reaches the disk before a rename points the app at it: a power cut must not leave empty files. */
function flushTree(root: string): void {
  //? Linux flushes everything in one call and waits for it; an fsync per file costs a journal commit each there.
  if (process.platform === "linux" && Bun.spawnSync(["sync"]).exitCode === 0) return;
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) flush(path);
    }
    flush(folder, true);
  };
  walk(root);
}

/**
 * The running app, from the executable path: macOS <App>.app/Contents/MacOS/<exe>, Windows and
 * Linux the folder of <exe> with resources/ (packages/desktop/src/ffi.ts resolvePaths).
 */
function appPath(mac: boolean): string | null {
  const exeDir = dirname(process.execPath);
  if (!mac) return existsSync(join(exeDir, "resources", "boot.json")) ? exeDir : null;
  const app = dirname(dirname(exeDir));
  return basename(exeDir) === "MacOS" && app.endsWith(".app") ? app : null;
}

const resourcesOf = (app: string, mac: boolean) => (mac ? join(app, "Contents", "Resources") : join(app, "resources"));

/**
 * Windows: the version Settings > Apps shows for an app the installer put here (windows-installer.ts writes the key
 * and puts the uninstaller beside the folder). A copy of the app elsewhere leaves the installed one's entry alone.
 * Best effort: the update stands anyway.
 */
async function recordInstalledVersion(appId: string, app: string | null, version: string): Promise<void> {
  if (!app || !version || !existsSync(`${app}.uninstall.exe`)) return;
  const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}`;
  //? Only exit codes are read: reg.exe writes in the OEM code page, which a non-ASCII profile folder would garble.
  const reg = async (args: string[]) =>
    (await Bun.spawn(["reg.exe", ...args], { stdin: "ignore", stdout: "ignore", stderr: "ignore", windowsHide: true })
      .exited) === 0;
  try {
    if (await reg(["query", key, "/v", "InstallLocation"]))
      await reg(["add", key, "/v", "DisplayVersion", "/t", "REG_SZ", "/d", version, "/f"]);
  } catch (error) {
    console.warn("[akan-native] updates: cannot record the installed version", error);
  }
}

function readConfig(app: string | null, mac: boolean): UpdatesConfig | null {
  const path = app ? join(resourcesOf(app, mac), "updates.json") : "";
  if (!app || !existsSync(path)) return null;
  const c = JSON.parse(readFileSync(path, "utf8")) as UpdatesConfig;
  return typeof c.url === "string" && typeof c.publicKey === "string" ? c : null;
}

export interface DesktopUpdatesOptions {
  platform?: NodeJS.Platform;
  /** The installed app; the running one by default. */
  app?: string | null;
  /** Its updates.json; read from `app` by default. */
  config?: UpdatesConfig | null;
  /** The executable's file name inside an app; the running one's by default. */
  exeName?: string;
  relaunch?(exe: string, moves: [string, string][], recover?: RelaunchOptions["recover"]): Promise<void>;
  serverBootAllowance?: number;
  serverSettle?: number;
}

export function createDesktopUpdates(options: DesktopUpdatesOptions = {}): DesktopPlugin<UpdatesApi, UpdatesEvents> {
  const platform = options.platform ?? process.platform;
  const mac = platform === "darwin";
  const windows = platform === "win32";
  const exeName = options.exeName ?? basename(process.execPath);
  const installed = options.app !== undefined ? options.app : appPath(mac);
  const config = options.config !== undefined ? options.config : readConfig(installed, mac);
  const relaunch = options.relaunch ?? ((exe, moves, recover) => relaunchAfterExit(exe, moves, { recover }));
  const allowance = options.serverBootAllowance ?? SERVER_BOOT_ALLOWANCE;
  const settleTime = options.serverSettle ?? SERVER_SETTLE;
  /** The executable inside an app with the running one's name. */
  const executableIn = (app: string) => (mac ? join(app, "Contents", "MacOS", exeName) : join(app, exeName));
  const resources = (app: string) => resourcesOf(app, mac);
  const carries = (app: string) => existsSync(join(resources(app), "server.json"));
  let dir = "";
  let onTrial = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let downloading = false;
  let unwritableTold = false;
  const refusalsTold = new Set<string>();
  let serverAnswered: Promise<string | null> = Promise.resolve(null);

  const statePath = () => join(dir, "state.json");
  const parseState = (path: string): State | null => {
    try {
      const s = JSON.parse(readFileSync(path, "utf8")) as State;
      return { ...s, failed: Array.isArray(s.failed) ? s.failed : [] };
    } catch {
      return null;
    }
  };
  //? A state.json a power cut left unreadable falls back to the one it replaced, never to nothing: nothing forgets
  //? the trial to roll back and the releases already refused.
  const readState = (): State => parseState(statePath()) ?? parseState(`${statePath()}.bak`) ?? { failed: [] };
  const writeState = (state: State) => {
    mkdirSync(dir, { recursive: true });
    const path = statePath();
    const failed = state.failed.slice(-20);
    const reasons = state.reasons
      ? Object.fromEntries(Object.entries(state.reasons).filter(([bundle]) => failed.includes(bundle)))
      : undefined;
    const tmp = `${path}.tmp`;
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, JSON.stringify({ ...state, failed, reasons }));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (existsSync(path)) renameSync(path, `${path}.bak`);
    renameSync(tmp, path);
    flush(dir, true);
  };
  const need = (): UpdatesConfig => {
    if (!config)
      throw new AkanNativeError(
        "UNSUPPORTED",
        "updates are not configured (akan-native.config.ts `updates`, a built app)",
      );
    return config;
  };
  /** `entry` when the running app is that release (installed by an update), not another build. */
  const ifRunning = <E extends Entry>(entry: E | undefined): E | undefined =>
    entry && config && entry.build === config.embeddedSequence ? entry : undefined;
  const runningIs = (entry: Entry | undefined) => ifRunning(entry) !== undefined;
  /** The release running now; one on trial is running too, confirmed or not. */
  const runningSequence = (c: UpdatesConfig, state: State) =>
    (ifRunning(state.trial) ?? ifRunning(state.current))?.sequence ?? c.embeddedSequence;

  const fail = (state: State, bundle: string, why: string) => {
    if (!state.failed.includes(bundle)) state.failed.push(bundle);
    state.reasons = { ...state.reasons, [bundle]: why };
    if (state.strikes) delete state.strikes[bundle];
  };
  /** One more failed try of `bundle`: true once it had `limit` of them, which makes it a failed release. */
  const strike = (state: State, bundle: string, why: string, limit = MAX_STRIKES): boolean => {
    const tries = (state.strikes?.[bundle] ?? 0) + 1;
    if (tries < limit) {
      state.strikes = { ...state.strikes, [bundle]: tries };
      return false;
    }
    fail(state, bundle, limit > 1 ? `${why} (${tries} tries)` : why);
    return true;
  };
  const entryOf = ({ bundle, sequence, version, tar, build }: Entry): Entry => ({
    bundle,
    sequence,
    version,
    tar,
    build,
  });

  const recover = (): RelaunchOptions["recover"] =>
    windows && config ? { script: join(dir, "recover.ps1"), name: `akan-native-update ${config.app}` } : undefined;
  const moveThenRelaunch = (moves: [string, string][], app: string) => relaunch(executableIn(app), moves, recover());

  /**
   * Puts .previous back, then relaunches it. A release that may pass another time (`retry`) stays downloaded as the
   * pending update until it had MAX_STRIKES; any other is failed.
   */
  const rollBack = async (state: State, quit: (code: number) => void, why: string, retry = false): Promise<void> => {
    const trial = state.trial;
    if (!trial || !installed) return; // settled meanwhile (another instance, notifyReady)
    const app = installed;
    const failed = strike(state, trial.bundle, why, retry ? MAX_STRIKES : 1);
    const tries = failed ? "" : `, to be tried again (${state.strikes?.[trial.bundle]} of ${MAX_STRIKES})`;
    console.warn(`[akan-native] updates: ${trial.bundle} ${why}; rolling back${tries}`);
    state.trial = undefined;
    state.rolledBack = trial.bundle;
    if (!existsSync(trial.previous)) {
      writeState(state);
      return;
    }
    //? A newer download already waiting supersedes the release being tried again.
    const keep = !failed && !(state.pending && state.pending.sequence > trial.sequence);
    const to = keep ? join(`${app}.update-${trial.bundle}`, basename(app)) : `${app}.failed-${trial.bundle}`;
    rmSync(keep ? dirname(to) : to, { recursive: true, force: true });
    if (keep) {
      mkdirSync(dirname(to), { recursive: true });
      state.pending = { ...entryOf(trial), staged: to };
    }
    state.rollback = { build: trial.build, previous: trial.previous, to, attempts: 1 };
    writeState(state);
    try {
      // macOS, Linux: the running app can be renamed; its open files stay valid.
      await moveThenRelaunch(
        [
          [app, to],
          [trial.previous, app],
        ],
        app,
      );
    } catch (error) {
      console.error(
        `[akan-native] updates: ${trial.bundle} could not be rolled back; the next start tries again`,
        error,
      );
      return;
    }
    quit(0);
  };

  /**
   * At most `limit` bytes (the manifest and its signature are read before they are verified, so a
   * bad server or a changed response could otherwise send anything; a file has its signed size).
   */
  const fetchBytes = async (url: string, limit: number, ctx?: DesktopContext): Promise<Uint8Array> => {
    // A download stops when its call does (the page gave up on it, or the page is gone).
    const response = await fetch(url, { cache: "no-store", ...(ctx?.signal ? { signal: ctx.signal } : {}) });
    if (response.status === 404) throw new AkanNativeError("NOT_FOUND", `${url} not found`);
    if (!response.ok) throw new AkanNativeError("INTERNAL", `${url}: HTTP ${response.status}`);
    const tooBig = () => new AkanNativeError("INTERNAL", `${url} is larger than ${limit} bytes`);
    if (Number(response.headers.get("content-length") ?? 0) > limit) throw tooBig();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for await (const chunk of response.body ?? []) {
      chunks.push(chunk);
      received += chunk.length;
      if (received > limit) {
        void response.body?.cancel().catch(() => {});
        throw tooBig();
      }
      ctx?.emit("progress", { received, total: limit });
    }
    const out = new Uint8Array(received);
    let at = 0;
    for (const c of chunks) out.set(c, at), (at += c.length);
    return out;
  };

  // Releases per OS and CPU (`akan-native update publish`): an x64 app must never install an arm64 one.
  const releases = (c: UpdatesConfig) => `${c.url}/${c.platform}-${process.arch}`;

  const fetchRelease = async (c: UpdatesConfig): Promise<Manifest> => {
    const base = `${releases(c)}/${c.channel}.json`;
    const manifest = await fetchBytes(base, MAX_MANIFEST);
    const signature = Buffer.from(
      new TextDecoder().decode(await fetchBytes(`${base}.sig`, MAX_SIGNATURE)).trim(),
      "base64",
    );
    const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(c.publicKey, "base64")]);
    if (!verify(null, manifest, createPublicKey({ key: spki, format: "der", type: "spki" }), signature)) {
      throw new AkanNativeError("INTERNAL", "the release signature does not match updates.publicKey");
    }
    const m = JSON.parse(new TextDecoder().decode(manifest)) as Manifest;
    const hex = (s: unknown) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
    if (
      m.schema !== 1 ||
      m.kind !== "app" ||
      m.app !== c.app ||
      m.platform !== c.platform ||
      m.arch !== process.arch ||
      m.channel !== c.channel
    ) {
      throw new AkanNativeError("INTERNAL", "invalid release manifest: made for another app, platform, CPU or channel");
    }
    if (
      typeof m.bundle !== "string" ||
      !isBundleId(m.bundle) ||
      !(m.sequence > 0) ||
      typeof m.build !== "number" ||
      !m.archive ||
      !hex(m.archive.sha256) ||
      !hex(m.archive.gzSha256) ||
      (m.server !== undefined && typeof m.server !== "boolean")
    ) {
      throw new AkanNativeError("INTERNAL", "invalid release manifest");
    }
    return m;
  };

  const isNewer = (c: UpdatesConfig, m: Manifest, state: State) =>
    m.sequence > runningSequence(c, state) && !state.failed.includes(m.bundle);
  const patchFor = (m: Manifest, state: State) => {
    const tar = ifRunning(state.current)?.tar;
    return tar && existsSync(join(dir, "app", `${tar}.tar`)) ? m.patches?.find((p) => p.from === tar) : undefined;
  };
  //? Taking the carried server away moves the pages to the build's own backend URL, and adding one starts them on an
  //? empty local database: either way the app's data changes place, which an update must not do.
  const serverRefusal = (release: boolean, app: string) =>
    release === carries(app)
      ? null
      : `the release ${release ? "carries a server, and this app does not" : "carries no server, and this app does"}; install it instead`;

  /** null once the carried server answered ready and stayed up SERVER_SETTLE; else why it did not in time. */
  const serverVerdict = (server: DesktopServerStatus): Promise<string | null> =>
    new Promise((resolve) => {
      let settling: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe = () => {};
      const done = (why: string | null) => {
        clearTimeout(boot);
        clearTimeout(settling);
        unsubscribe();
        resolve(why);
      };
      const boot = setTimeout(() => done(`its server was not up within ${allowance / 1000} s`), allowance);
      const watch = (state: DesktopServerState) => {
        clearTimeout(settling);
        if (state === "up") settling = setTimeout(() => done(null), settleTime);
        else if (state === "gaveUp") done("its server gave up");
      };
      unsubscribe = server.onState(watch);
      watch(server.state);
    });
  /** true once the server is up (now or at its next ready), false when it gave up or the app quits first. */
  const upAgain = (server: DesktopServerStatus) =>
    new Promise<boolean>((resolve) => {
      if (server.state === "up") return resolve(true);
      const unsubscribe = server.onState((state) => {
        if (state !== "up" && state !== "gaveUp" && state !== "stopped") return;
        unsubscribe();
        resolve(state === "up");
      });
    });

  const watchTrial = (ctx: DesktopContext, c: UpdatesConfig) => {
    onTrial = true;
    const failTrial = (why: string, retry: boolean) => {
      if (!onTrial) return;
      onTrial = false;
      clearTimeout(timer);
      void rollBack(readState(), (code) => ctx.quit(code), why, retry);
    };
    const server = ctx.server;
    serverAnswered = server ? serverVerdict(server) : Promise.resolve(null);
    void serverAnswered.then((why) => why !== null && failTrial(why, true));
    server?.onState((state) => state === "gaveUp" && failTrial("its server gave up", true));
    ctx.onNativeEvent("pageLoad", (e) => {
      if (e.event !== "finished" || (e.window ?? 1) !== 1 || !onTrial) return;
      //? A carried server still starting (a new release's first run, its files being scanned) is not the release
      //? failing: the clock starts once the server has settled.
      void serverAnswered.then((why) => {
        if (why !== null || !onTrial) return;
        clearTimeout(timer);
        timer = setTimeout(() => failTrial("did not call notifyReady() in time", false), c.readyTimeout);
      });
    });
  };

  const setup = async (ctx: DesktopContext) => {
    //? Local, never Roaming: the unpacked releases are the whole app, and a trial belongs to this PC's install. A debug
    //? build has the release app's id: a record of its own keeps it from dropping that app's downloads as older.
    dir = join(ctx.appLocalDataDir, ctx.dev ? "akan-native-updates-debug" : "akan-native-updates");
    const app = installed;
    if (!config || !app) return;
    const state = readState();
    let changed = false;
    //? Installed again (the installer, a copy of another build): what the earlier install refused says nothing now.
    if (!runningIs(state.current) && !runningIs(state.trial) && state.installed !== config.embeddedSequence) {
      if (state.installed !== undefined) {
        state.failed = [];
        state.reasons = undefined;
        state.strikes = undefined;
      }
      state.installed = config.embeddedSequence;
      changed = true;
    }
    //? A download from before the app was reinstalled at a newer build would take it back.
    if (state.pending && state.pending.sequence <= runningSequence(config, state)) {
      console.warn(`[akan-native] updates: ${state.pending.bundle} is not newer than this app; dropping it`);
      state.pending = undefined;
      changed = true;
    }
    const rollback = state.rollback;
    if (rollback) {
      state.rollback = undefined;
      changed = true;
      //? Still the failed build: the moves of its rollback did not happen (a rename refused, a helper that never ran).
      if (
        rollback.build === config.embeddedSequence &&
        existsSync(rollback.previous) &&
        rollback.attempts < MAX_STRIKES
      ) {
        state.rollback = { ...rollback, attempts: rollback.attempts + 1 };
        writeState(state);
        console.warn("[akan-native] updates: the last rollback did not happen; trying it again");
        try {
          rmSync(rollback.to, { recursive: true, force: true });
          mkdirSync(dirname(rollback.to), { recursive: true });
          await moveThenRelaunch(
            [
              [app, rollback.to],
              [rollback.previous, app],
            ],
            app,
          );
          ctx.launch.exit(0);
          return;
        } catch (error) {
          console.error("[akan-native] updates: the rollback failed again", error);
        }
      }
    }
    if (state.trial && !runningIs(state.trial)) {
      const trial = state.trial;
      state.trial = undefined;
      changed = true;
      //? Still the build that applied it: the helper put the app back (a file stayed locked through its retries), or
      //? never ran (a logoff right after apply, PowerShell refused). The release waits for the next apply.
      if (trial.from === config.embeddedSequence) {
        const failed = strike(state, trial.bundle, "could not be moved into place");
        const tries = failed
          ? ""
          : `; it is tried again at the next apply (${state.strikes?.[trial.bundle]} of ${MAX_STRIKES})`;
        console.warn(`[akan-native] updates: ${trial.bundle} could not be moved into place${tries}`);
        if (
          !failed &&
          trial.staged &&
          existsSync(executableIn(trial.staged)) &&
          !(state.pending && state.pending.sequence > trial.sequence)
        )
          state.pending = { ...entryOf(trial), staged: trial.staged };
      }
    }
    if (changed) writeState(state);
    // Leftovers of earlier swaps: failed apps, unpacked updates nothing points at, the .previous of a confirmed release.
    const confirmed = !state.trial && !state.rollback && runningIs(state.current);
    for (const name of readdirSync(dirname(app))) {
      const path = join(dirname(app), name);
      if (
        name.startsWith(`${basename(app)}.failed-`) ||
        (name.startsWith(`${basename(app)}.update-`) && path !== dirname(state.pending?.staged ?? "")) ||
        (name === `${basename(app)}.previous` && confirmed)
      ) {
        rmSync(path, { recursive: true, force: true });
      }
    }
    const trial = state.trial;
    if (!trial) return;
    const boot = bootTime();
    //? An app that carries a server always has single-instance (build-desktop refuses it without): a second instance
    //? ends at that gate before any setup runs, so a live PID other than this one is never the trial.
    if (
      !ctx.server &&
      trial.pid !== undefined &&
      trial.pid !== process.pid &&
      (trial.boot === undefined || Math.abs(trial.boot - boot) <= 60) &&
      alive(trial.pid)
    ) {
      // A second instance (a deep link on Windows or Linux starts one) while the trial runs:
      // not a restart of the trial. single-instance hands over and this process exits.
      return;
    }
    if (++trial.attempts > 1)
      return rollBack(state, (code) => ctx.launch.exit(code), "was started again without notifyReady()");
    trial.pid = process.pid;
    trial.boot = boot;
    writeState(state);
    watchTrial(ctx, config);
  };

  const plugin: DesktopPlugin<UpdatesApi, UpdatesEvents> = {
    id: "updates",
    setup,
    // download() emits progress itself (ctx.emit); the source only registers the page's listener.
    events: { progress: () => () => {} },
    methods: {
      async getState() {
        const c = need();
        const state = readState();
        const current = ifRunning(state.trial) ?? ifRunning(state.current);
        return {
          bundle: current?.bundle ?? null,
          sequence: current?.sequence ?? 0,
          pending: state.pending?.bundle ?? null,
          trial: onTrial,
          rolledBack: state.rolledBack ?? null,
          channel: c.channel,
          nativeApi: c.nativeApi,
        } satisfies UpdateState;
      },

      async check() {
        const c = need();
        const m = await fetchRelease(c);
        const state = readState();
        const refusal = typeof m.server === "boolean" && installed ? serverRefusal(m.server, installed) : null;
        if (refusal && !refusalsTold.has(m.bundle)) {
          refusalsTold.add(m.bundle);
          console.warn(`[akan-native] updates: ${m.bundle}: ${refusal}`);
        }
        const available = !refusal && isNewer(c, m, state);
        return {
          available,
          bundle: m.bundle,
          version: m.version,
          sequence: m.sequence,
          downloadSize: available ? (patchFor(m, state)?.size ?? m.archive?.size ?? null) : null,
        } satisfies UpdateCheck;
      },

      async download(_args, ctx) {
        const c = need();
        const app = installed as string;
        if (downloading) throw new AkanNativeError("CANCELLED", "a download is already running");
        downloading = true;
        try {
          const m = await fetchRelease(c);
          const archive = m.archive as NonNullable<Manifest["archive"]>;
          const state = readState();
          if (!isNewer(c, m, state)) throw new AkanNativeError("NOT_FOUND", "no newer release for this app");
          const refusal = typeof m.server === "boolean" ? serverRefusal(m.server, app) : null;
          if (refusal) throw new AkanNativeError("NOT_ALLOWED", refusal);
          if (state.pending?.bundle === m.bundle && existsSync(state.pending.staged)) return { bundle: m.bundle };
          //? Unpacked beside the app, where the swap is a rename. An app installed where this user cannot write is
          //? updated by its installer, and finding that out must not cost the whole download at every check.
          const staging = `${app}.update-${m.bundle}`;
          try {
            rmSync(staging, { recursive: true, force: true });
            mkdirSync(staging, { recursive: true });
          } catch (error) {
            if (!unwritableTold) {
              unwritableTold = true;
              console.warn(
                `[akan-native] updates: cannot write beside ${app}; install new releases with the installer`,
                error,
              );
            }
            throw new AkanNativeError(
              "NOT_ALLOWED",
              `${dirname(app)} is not writable: install the release with its installer`,
            );
          }
          // The release tar: a delta from ours if we can, else the whole archive.
          let tar: Uint8Array | null = null;
          const patch = patchFor(m, state);
          if (patch) {
            try {
              const gz = await fetchBytes(`${releases(c)}/${patch.url}`, patch.size, ctx);
              if (sha256(gz) !== patch.sha256) throw new Error("delta hash");
              tar = applyDelta(
                readFileSync(join(dir, "app", `${patch.from}.tar`)),
                Bun.gunzipSync(gz as Uint8Array<ArrayBuffer>),
              );
            } catch (error) {
              console.warn("[akan-native] updates: delta failed, downloading the whole release", error);
              tar = null;
            }
          }
          if (!tar) {
            const gz = await fetchBytes(`${releases(c)}/${archive.url}`, archive.size, ctx);
            if (sha256(gz) !== archive.gzSha256)
              throw new AkanNativeError("INTERNAL", "the release archive does not match its hash");
            tar = Bun.gunzipSync(gz as Uint8Array<ArrayBuffer>);
          }
          if (sha256(tar) !== archive.sha256)
            throw new AkanNativeError("INTERNAL", "the release does not match its hash");

          // Unpack next to the app and check it before anything points at it.
          const tarFile = join(staging, "release.tar");
          writeFileSync(tarFile, tar);
          const run = async (cmd: string[]) => {
            const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
            const [err, code] = await Promise.all([new Response(p.stderr).text(), p.exited]);
            if (code !== 0) throw new AkanNativeError("INTERNAL", `${basename(cmd[0] ?? "")} failed: ${err.trim()}`);
          };
          // bsdtar is in Windows since 10 (System32\tar.exe).
          await run([tarBinary(), "-xf", tarFile, "-C", staging]);
          rmSync(tarFile);
          //? The release's app is named for its build; the installed one may be named otherwise (the installer's /D=,
          //? a renamed .app), and the swap gives it the installed one's name.
          const unpacked = readdirSync(staging);
          const staged = unpacked.length === 1 ? join(staging, unpacked[0] as string) : "";
          if (!staged || !existsSync(executableIn(staged)))
            throw new AkanNativeError("INTERNAL", `the release is not one app with ${exeName}`);
          let id = "";
          if (mac) {
            id = Bun.spawnSync([
              "/usr/bin/plutil",
              "-extract",
              "CFBundleIdentifier",
              "raw",
              "-o",
              "-",
              join(staged, "Contents", "Info.plist"),
            ])
              .stdout.toString()
              .trim();
          } else {
            try {
              id =
                (
                  JSON.parse(readFileSync(join(resources(staged), "boot.json"), "utf8")) as {
                    app?: { id?: string };
                  }
                ).app?.id ?? "";
            } catch {}
          }
          if (id !== c.app)
            throw new AkanNativeError("INTERNAL", `the release is ${id || "not an akan-native app"}, not ${c.app}`);
          // The manifest signature already vouches for the bytes; macOS also checks the code signature
          // (Windows Authenticode and Linux packages come with distribution signing, CLI-9).
          if (mac) await run(["/usr/bin/codesign", "--verify", "--deep", "--strict", staged]);
          const unpackedRefusal = serverRefusal(carries(staged), app);
          if (unpackedRefusal) {
            rmSync(staging, { recursive: true, force: true });
            const latest = readState();
            fail(latest, m.bundle, unpackedRefusal);
            writeState(latest);
            throw new AkanNativeError("NOT_ALLOWED", unpackedRefusal);
          }
          flushTree(staged);

          // Keep this release's tar for the next delta, and only that one.
          mkdirSync(join(dir, "app"), { recursive: true });
          for (const name of readdirSync(join(dir, "app"))) rmSync(join(dir, "app", name), { force: true });
          writeFileSync(join(dir, "app", `${archive.sha256}.tar`), tar);
          //? Read again: a trial confirmed while this downloaded must not be written back as unconfirmed.
          const latest = readState();
          latest.pending = {
            bundle: m.bundle,
            sequence: m.sequence,
            version: m.version,
            tar: archive.sha256,
            build: m.build as number,
            staged,
          };
          writeState(latest);
          return { bundle: m.bundle };
        } finally {
          downloading = false;
        }
      },

      async apply(_args, ctx) {
        const c = need();
        const app = installed as string;
        const state = readState();
        //? .previous is what a release on trial rolls back to: applying another would replace it with that release.
        if (runningIs(state.trial))
          throw new AkanNativeError(
            "NOT_ALLOWED",
            "the running release is on trial: apply once notifyReady() confirmed it",
          );
        const pending = state.pending;
        if (!pending || !existsSync(pending.staged) || pending.sequence <= runningSequence(c, state))
          throw new AkanNativeError("NOT_FOUND", "no downloaded update to apply");
        const refusal = serverRefusal(carries(pending.staged), app);
        if (refusal) {
          rmSync(dirname(pending.staged), { recursive: true, force: true });
          state.pending = undefined;
          fail(state, pending.bundle, refusal);
          writeState(state);
          throw new AkanNativeError("NOT_ALLOWED", refusal);
        }
        const previous = `${app}.previous`;
        rmSync(previous, { recursive: true, force: true });
        const entry = entryOf(pending);
        if (windows) {
          // The helper swaps once this app has exited; the staging folder (now empty) goes at the next start.
          state.trial = { ...entry, previous, attempts: 0, from: c.embeddedSequence, staged: pending.staged };
          state.pending = undefined;
          writeState(state);
          await moveThenRelaunch(
            [
              [app, previous],
              [pending.staged, app],
            ],
            app,
          );
        } else {
          // The trial is on record before the swap: a crash in between leaves a trial whose app
          // does not run (setup drops it), never a new app without a trial to roll back.
          state.trial = { ...entry, previous, attempts: 0 };
          state.pending = undefined;
          writeState(state);
          let moved = false;
          try {
            renameSync(app, previous);
            moved = true;
            renameSync(pending.staged, app);
          } catch (error) {
            if (moved) renameSync(previous, app); // never leave no app behind
            state.trial = undefined;
            state.pending = pending;
            writeState(state);
            throw new AkanNativeError("INTERNAL", `could not move the update into place: ${error}`);
          }
          rmSync(dirname(pending.staged), { recursive: true, force: true });
          await moveThenRelaunch([], app);
        }
        setTimeout(() => ctx.quit(0), 50); // answer first
      },

      async notifyReady(_args, ctx) {
        const c = need();
        if (!onTrial) return;
        //? A release whose server never comes up is as broken as one whose page never renders: it is not
        //? confirmed, and the trial rolls it back.
        if ((await serverAnswered) !== null || !onTrial) return;
        //? A server that crashed after it settled is restarting: the release is confirmed once it answers again.
        if (ctx.server && !(await upAgain(ctx.server))) return;
        if (!onTrial) return;
        clearTimeout(timer);
        onTrial = false;
        const state = readState();
        const trial = state.trial;
        if (!trial) return;
        const entry = entryOf(trial);
        state.current = entry;
        state.trial = undefined;
        state.rolledBack = undefined;
        if (state.strikes) delete state.strikes[entry.bundle];
        writeState(state);
        try {
          rmSync(trial.previous, { recursive: true, force: true });
        } catch (error) {
          console.warn(`[akan-native] updates: ${trial.previous} stays until the next start`, error);
        }
        if (windows) void recordInstalledVersion(c.app, installed, entry.version);
      },

      async reset() {
        need();
        const state = readState();
        if (state.pending) rmSync(dirname(state.pending.staged), { recursive: true, force: true });
        //? A release on trial keeps its record, and a rollback that did not happen its retry: without them the running
        //? app could be neither confirmed nor put back.
        writeState({
          failed: [],
          ...(state.current ? { current: state.current } : {}),
          ...(runningIs(state.trial) ? { trial: state.trial } : {}),
          ...(state.rollback ? { rollback: state.rollback } : {}),
          ...(state.installed !== undefined ? { installed: state.installed } : {}),
        });
      },
    },
  };
  return plugin;
}

export default defineDesktopPlugin<UpdatesApi, UpdatesEvents>(createDesktopUpdates());

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
//   and swapped in by apply(): <App>.app → <App>.app.previous, the new one → <App>.app, relaunch.
//   Windows does not rename a folder whose program is running, so there a helper (PowerShell,
//   started through cmd.exe to outlive the app) waits for the app to exit, does the renames and
//   starts the result (moveThenRelaunch).
// - The new app runs on trial. notifyReady() within updates.readyTimeout confirms it and removes
//   .previous; a timeout, or a second launch without confirming, swaps .previous back and relaunches
//   it. Electrobun deletes .previous as soon as the new app launched (main.zig:7811-7818) and Tauri
//   drops its backup when the final rename fails (updater.rs:1429-1476); here the old app stays
//   until the new one said it works.

import { spawn } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { isBundleId } from "../../../packages/core/src/kernel.ts";
import { applyDelta } from "../../../packages/desktop/src/delta.ts";
import { type DesktopContext, type DesktopPlugin, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { UpdateCheck, UpdateState, UpdatesApi, UpdatesEvents } from "./index.ts";

interface Config {
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

interface State {
  current?: Entry;
  pending?: Entry & { staged: string };
  /** `pid`: the process running the trial, so a second instance of the app leaves it alone. */
  trial?: Entry & { previous: string; attempts: number; pid?: number };
  failed: string[];
  rolledBack?: string;
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
}

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

const mac = process.platform === "darwin";
const windows = process.platform === "win32";

/**
 * The running app, from the executable path: macOS <App>.app/Contents/MacOS/<exe>, Windows and
 * Linux the folder of <exe> with resources/ (packages/desktop/src/ffi.ts resolvePaths).
 */
function appPath(): string | null {
  const exeDir = dirname(process.execPath);
  if (!mac) return existsSync(join(exeDir, "resources", "boot.json")) ? exeDir : null;
  const app = dirname(dirname(exeDir));
  return basename(exeDir) === "MacOS" && app.endsWith(".app") ? app : null;
}

const resourcesOf = (app: string) => (mac ? join(app, "Contents", "Resources") : join(app, "resources"));
/** The executable inside an app with the running one's name. */
const executableIn = (app: string) =>
  mac ? join(app, "Contents", "MacOS", basename(process.execPath)) : join(app, basename(process.execPath));

function readConfig(): Config | null {
  const app = appPath();
  const path = app ? join(resourcesOf(app), "updates.json") : "";
  if (!app || !existsSync(path)) return null;
  const c = JSON.parse(readFileSync(path, "utf8")) as Config;
  return typeof c.url === "string" && typeof c.publicKey === "string" ? c : null;
}

export default defineDesktopPlugin<UpdatesApi, UpdatesEvents>(
  (() => {
    const config = readConfig();
    let dir = "";
    let onTrial = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let downloading = false;

    const statePath = () => join(dir, "state.json");
    const readState = (): State => {
      try {
        const s = JSON.parse(readFileSync(statePath(), "utf8")) as State;
        return { ...s, failed: Array.isArray(s.failed) ? s.failed : [] };
      } catch {
        return { failed: [] };
      }
    };
    const writeState = (state: State) => {
      mkdirSync(dir, { recursive: true });
      const tmp = `${statePath()}.tmp`;
      writeFileSync(tmp, JSON.stringify({ ...state, failed: state.failed.slice(-20) }));
      renameSync(tmp, statePath());
    };
    const need = (): Config => {
      if (!config)
        throw new AkanNativeError(
          "UNSUPPORTED",
          "updates are not configured (akan-native.config.ts `updates`, a built app)",
        );
      return config;
    };
    /** The running app is this release (installed by an update), not another build. */
    const runningIs = (entry: Entry | undefined) => !!entry && !!config && entry.build === config.embeddedSequence;

    /**
     * Once this process has exited (single-instance, locks): renames `moves` in order and starts
     * `app` with this environment. macOS and Linux rename a running app's folder right away, so only
     * the start waits; Windows refuses that, so a helper does the renames too (and on a failed
     * rename puts back what it moved, so there is always an app to start).
     */
    const moveThenRelaunch = (moves: [string, string][], app: string): Promise<void> => {
      const exe = executableIn(app);
      if (!windows) {
        for (const [from, to] of moves) renameSync(from, to);
        const child = spawn(
          "/bin/sh",
          ["-c", 'while kill -0 "$AKAN_NATIVE_PARENT" 2>/dev/null; do sleep 0.2; done; exec "$AKAN_NATIVE_EXE"'],
          {
            detached: true,
            stdio: "inherit",
            env: { ...process.env, AKAN_NATIVE_PARENT: String(process.pid), AKAN_NATIVE_EXE: exe },
          },
        );
        child.unref();
        return Promise.resolve();
      }
      // Paths go in environment variables, so no quoting of them is involved. Files of the exiting
      // app can stay locked for a moment after its exit (antivirus, WebView2): retry the renames.
      // -NoNewWindow: the new app gets this app's standard handles, as with exec on macOS and Linux.
      const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Wait-Process -Id $env:AKAN_NATIVE_PARENT -ErrorAction SilentlyContinue
$moves = $env:AKAN_NATIVE_MOVES | ConvertFrom-Json
$done = @()
try {
  foreach ($m in $moves) {
    for ($i = 0; ; $i++) { try { Move-Item -LiteralPath $m[0] -Destination $m[1]; break } catch { if ($i -ge 40) { throw }; Start-Sleep -Milliseconds 250 } }
    $done = ,$m + $done
  }
} catch {
  foreach ($m in $done) { try { Move-Item -LiteralPath $m[1] -Destination $m[0] } catch {} }
}
Start-Process -NoNewWindow -FilePath $env:AKAN_NATIVE_EXE
`;
      // Bun (libuv) puts its children in a job object that ends them when this app exits, and a
      // detached child (DETACHED_PROCESS, no console) is powershell.exe exiting at once without
      // running anything (Windows 11 26200). The job lets a child's own children break away, so a
      // windowless cmd.exe starts the helper with `start /b` and returns; the app waits for that, or
      // its exit would end cmd.exe before the helper started. -EncodedCommand: base64, nothing in it
      // for cmd to parse.
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      const env = {
        ...process.env,
        AKAN_NATIVE_PARENT: String(process.pid),
        AKAN_NATIVE_EXE: exe,
        AKAN_NATIVE_MOVES: JSON.stringify(moves),
      };
      const args = [
        "/d",
        "/c",
        "start",
        "/b",
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        encoded,
      ];
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn("cmd.exe", args, { stdio: "inherit", windowsHide: true, env });
      } catch {
        child = spawn("cmd.exe", args, { stdio: "ignore", windowsHide: true, env }); // an app without standard handles
      }
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timeout);
          resolve();
        };
        const timeout = setTimeout(done, 2_500); // within the plugin setup's 3 s (a rollback at launch)
        child.once("exit", done);
        child.once("error", (error) => {
          console.error("[akan-native] updates: cannot start the relaunch helper", error);
          done();
        });
      });
    };

    /** Puts .previous back, marks the trial failed and relaunches the old app. */
    const rollBack = async (state: State, quit: (code: number) => void, why: string): Promise<void> => {
      const trial = state.trial;
      if (!trial) return; // settled meanwhile (another instance, notifyReady)
      const app = appPath()!;
      console.warn(`[akan-native] updates: ${trial.bundle} ${why}; rolling back`);
      state.trial = undefined;
      state.failed.push(trial.bundle);
      state.rolledBack = trial.bundle;
      if (existsSync(trial.previous)) {
        const failed = `${app}.failed-${trial.bundle}`;
        rmSync(failed, { recursive: true, force: true });
        writeState(state);
        // macOS, Linux: the running app can be renamed; its open files stay valid.
        await moveThenRelaunch(
          [
            [app, failed],
            [trial.previous, app],
          ],
          app,
        );
        quit(0);
      } else writeState(state);
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
    const releases = (c: Config) => `${c.url}/${c.platform}-${process.arch}`;

    const fetchRelease = async (c: Config): Promise<Manifest> => {
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
        throw new AkanNativeError(
          "INTERNAL",
          "invalid release manifest: made for another app, platform, CPU or channel",
        );
      }
      if (
        typeof m.bundle !== "string" ||
        !isBundleId(m.bundle) ||
        !(m.sequence > 0) ||
        typeof m.build !== "number" ||
        !m.archive ||
        !hex(m.archive.sha256) ||
        !hex(m.archive.gzSha256)
      ) {
        throw new AkanNativeError("INTERNAL", "invalid release manifest");
      }
      return m;
    };

    const running = (state: State) => (runningIs(state.current) ? state.current!.sequence : config!.embeddedSequence);
    const isNewer = (m: Manifest, state: State) => m.sequence > running(state) && !state.failed.includes(m.bundle);
    const patchFor = (m: Manifest, state: State) => {
      const tar = runningIs(state.current) ? state.current!.tar : undefined;
      return tar && existsSync(join(dir, "app", `${tar}.tar`)) ? m.patches?.find((p) => p.from === tar) : undefined;
    };

    const setup = (ctx: DesktopContext) => {
      dir = join(ctx.appDataDir, "akan-native-updates");
      const app = appPath();
      if (!config || !app) return;
      // Leftovers of earlier swaps: failed apps, unpacked updates nothing points at.
      const state = readState();
      for (const name of readdirSync(dirname(app))) {
        const path = join(dirname(app), name);
        if (
          name.startsWith(`${basename(app)}.failed-`) ||
          (name.startsWith(`${basename(app)}.update-`) && path !== dirname(state.pending?.staged ?? ""))
        ) {
          rmSync(path, { recursive: true, force: true });
        }
      }
      if (state.trial) {
        if (!runningIs(state.trial)) {
          state.trial = undefined; // the swap did not happen (or another build was installed)
          writeState(state);
        } else if (state.trial.pid !== undefined && state.trial.pid !== process.pid && alive(state.trial.pid)) {
          // A second instance (a deep link on Windows or Linux starts one) while the trial runs:
          // not a restart of the trial. single-instance hands over and this process exits.
        } else if (++state.trial.attempts > 1) {
          return rollBack(state, (code) => ctx.launch.exit(code), "was started again without notifyReady()");
        } else {
          state.trial.pid = process.pid;
          writeState(state);
          onTrial = true;
          ctx.onNativeEvent("pageLoad", (e) => {
            if (e.event !== "finished" || (e.window ?? 1) !== 1 || !onTrial) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
              if (onTrial) void rollBack(readState(), (code) => ctx.quit(code), "did not call notifyReady() in time");
            }, config.readyTimeout);
          });
        }
      }
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
          const current = runningIs(state.trial) ? state.trial : runningIs(state.current) ? state.current : undefined;
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
          const available = isNewer(m, state);
          return {
            available,
            bundle: m.bundle,
            version: m.version,
            sequence: m.sequence,
            downloadSize: available ? (patchFor(m, state)?.size ?? m.archive!.size) : null,
          } satisfies UpdateCheck;
        },

        async download(_args, ctx) {
          const c = need();
          const app = appPath()!;
          if (downloading) throw new AkanNativeError("CANCELLED", "a download is already running");
          downloading = true;
          try {
            const m = await fetchRelease(c);
            const state = readState();
            if (!isNewer(m, state)) throw new AkanNativeError("NOT_FOUND", "no newer release for this app");
            if (state.pending?.bundle === m.bundle && existsSync(state.pending.staged)) return { bundle: m.bundle };
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
              const gz = await fetchBytes(`${releases(c)}/${m.archive!.url}`, m.archive!.size, ctx);
              if (sha256(gz) !== m.archive!.gzSha256)
                throw new AkanNativeError("INTERNAL", "the release archive does not match its hash");
              tar = Bun.gunzipSync(gz as Uint8Array<ArrayBuffer>);
            }
            if (sha256(tar) !== m.archive!.sha256)
              throw new AkanNativeError("INTERNAL", "the release does not match its hash");

            // Unpack next to the app and check it before anything points at it.
            const staging = `${app}.update-${m.bundle}`;
            rmSync(staging, { recursive: true, force: true });
            mkdirSync(staging, { recursive: true });
            const tarFile = join(staging, "release.tar");
            writeFileSync(tarFile, tar);
            const run = async (cmd: string[]) => {
              const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
              const [err, code] = await Promise.all([new Response(p.stderr).text(), p.exited]);
              if (code !== 0) throw new AkanNativeError("INTERNAL", `${basename(cmd[0]!)} failed: ${err.trim()}`);
            };
            // bsdtar is in Windows since 10 (System32\tar.exe).
            await run([windows ? "tar.exe" : "/usr/bin/tar", "-xf", tarFile, "-C", staging]);
            rmSync(tarFile);
            const staged = join(staging, basename(app));
            if (!existsSync(executableIn(staged)))
              throw new AkanNativeError(
                "INTERNAL",
                `the release has no ${basename(app)} with ${basename(process.execPath)}`,
              );
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
                    JSON.parse(readFileSync(join(resourcesOf(staged), "boot.json"), "utf8")) as {
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

            // Keep this release's tar for the next delta, and only that one.
            mkdirSync(join(dir, "app"), { recursive: true });
            for (const name of readdirSync(join(dir, "app"))) rmSync(join(dir, "app", name), { force: true });
            writeFileSync(join(dir, "app", `${m.archive!.sha256}.tar`), tar);
            state.pending = {
              bundle: m.bundle,
              sequence: m.sequence,
              version: m.version,
              tar: m.archive!.sha256,
              build: m.build!,
              staged,
            };
            writeState(state);
            return { bundle: m.bundle };
          } finally {
            downloading = false;
          }
        },

        async apply(_args, ctx) {
          need();
          const app = appPath()!;
          const state = readState();
          const pending = state.pending;
          if (!pending || !existsSync(pending.staged))
            throw new AkanNativeError("NOT_FOUND", "no downloaded update to apply");
          const previous = `${app}.previous`;
          rmSync(previous, { recursive: true, force: true });
          const { staged: _staged, ...entry } = pending;
          if (windows) {
            // The helper swaps once this app has exited; the staging folder (now empty) goes at the next start.
            state.trial = { ...entry, previous, attempts: 0 };
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

        async notifyReady() {
          need();
          if (!onTrial) return;
          clearTimeout(timer);
          onTrial = false;
          const state = readState();
          const trial = state.trial;
          if (!trial) return;
          const { previous, attempts: _attempts, ...entry } = trial;
          state.current = entry;
          state.trial = undefined;
          state.rolledBack = undefined;
          writeState(state);
          rmSync(previous, { recursive: true, force: true });
        },

        async reset() {
          need();
          const state = readState();
          if (state.pending) rmSync(dirname(state.pending.staged), { recursive: true, force: true });
          writeState({ failed: [], ...(state.current ? { current: state.current } : {}) });
        },
      },
    };
    return plugin;
  })(),
);

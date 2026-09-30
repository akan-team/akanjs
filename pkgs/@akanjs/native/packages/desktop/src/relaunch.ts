// Starting the app again once this process has exited: an update's swap (plugins/updates), app.relaunch(),
// and desktop.recovery "reload" when the webview's browser process ends (host.ts). The new process must not
// start while this one runs: single-instance would hand it over to this one, and locks are still held.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname } from "node:path";

export interface RelaunchOptions {
  /** How long the helper waits after this process exited before it starts the app. */
  delayMs?: number;
  /**
   * Windows, a swap: while the helper moves the folders, a RunOnce value named `name` runs `script` (written here) at
   * the next logon, which puts back what a shutdown or a killed helper left half moved and starts the app. The helper
   * removes the value once the moves are done or undone.
   */
  recover?: { script: string; name: string };
}

const RUN_ONCE = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce";

/** A PowerShell single-quoted literal. */
const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * The recovery `recover.script` holds: when `exe` is missing, every move whose source is gone and whose target is
 * there goes back, newest first, and the app starts. An app that is there was never half moved: it is left alone.
 */
export function recoveryScript(exe: string, moves: [string, string][]): string {
  return `$ErrorActionPreference = 'SilentlyContinue'
$exe = ${quoted(exe)}
if (Test-Path -LiteralPath $exe) { exit }
$moves = ${quoted(JSON.stringify(moves))} | ConvertFrom-Json
[array]::Reverse($moves)
foreach ($m in $moves) { if (-not (Test-Path -LiteralPath $m[0]) -and (Test-Path -LiteralPath $m[1])) { Move-Item -LiteralPath $m[1] -Destination $m[0] } }
if (Test-Path -LiteralPath $exe) { Start-Process -WorkingDirectory $env:TEMP -FilePath $exe }
`;
}

/**
 * The RunOnce command for a recovery script, or null past the 260 characters Windows runs from there. The script is
 * read as text: an execution policy that refuses .ps1 files does not apply to it, as it does not to -EncodedCommand.
 */
export function recoveryCommand(script: string): string | null {
  const command = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "iex ([IO.File]::ReadAllText(${quoted(script)}))"`;
  return command.length <= 260 ? command : null;
}

//? One relaunch per process: the browser process's end reaches every window (one event each), and a page may
//? call app.relaunch() twice; a second helper would start a second app.
let started: Promise<void> | null = null;

/**
 * Once this process has exited: renames `moves` in order and starts `exe` with this environment. macOS and
 * Linux rename a running app's folder right away, so only the start waits; Windows refuses that, so a helper
 * does the renames too (and on a failed rename puts back what it moved, so there is always an app to start).
 * Only the first call of a process starts a helper; later ones answer the same promise.
 */
export function relaunchAfterExit(
  exe: string,
  moves: [string, string][] = [],
  { delayMs = 0, recover }: RelaunchOptions = {},
): Promise<void> {
  if (started) return started;
  try {
    const helper = startHelper(exe, moves, Math.max(0, Math.round(delayMs)), recover);
    started = helper;
    return helper;
  } catch (error) {
    return Promise.reject(error);
  }
}

function startHelper(
  exe: string,
  moves: [string, string][],
  delayMs: number,
  recover: RelaunchOptions["recover"],
): Promise<void> {
  //? The CLI's contract with the app it started (lib.rs stdin_quit): nobody holds the new app's stdin, and
  //? reading it closed would quit it at once.
  const { AKAN_NATIVE_QUIT_ON_STDIN: _cli, ...inherited } = process.env;
  const delay = (delayMs / 1000).toFixed(3);
  if (process.platform !== "win32") {
    const done: [string, string][] = [];
    try {
      for (const [from, to] of moves) {
        renameSync(from, to);
        done.unshift([from, to]);
      }
    } catch (error) {
      for (const [from, to] of done) {
        try {
          renameSync(to, from);
        } catch (undo) {
          console.error(`[akan-native] cannot put ${from} back`, undo);
        }
      }
      throw error;
    }
    //? A parent its own launcher never reaps stays a zombie that `kill -0` still finds: its state is read too.
    const child = spawn(
      "/bin/sh",
      [
        "-c",
        'while kill -0 "$AKAN_NATIVE_PARENT" 2>/dev/null && [ "$(ps -o stat= -p "$AKAN_NATIVE_PARENT" 2>/dev/null | cut -c1)" != Z ]; do sleep 0.2; done; sleep "$AKAN_NATIVE_DELAY"; exec "$AKAN_NATIVE_EXE"',
      ],
      {
        detached: true,
        stdio: "inherit",
        env: {
          ...inherited,
          AKAN_NATIVE_PARENT: String(process.pid),
          AKAN_NATIVE_EXE: exe,
          AKAN_NATIVE_DELAY: delay,
        },
      },
    );
    child.once("error", (error) => console.error("[akan-native] cannot start the relaunch helper", error));
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
$runOnce = '${RUN_ONCE}'
if ($env:AKAN_NATIVE_RECOVER) {
  try {
    if (-not (Test-Path $runOnce)) { New-Item -Path $runOnce -Force | Out-Null }
    Set-ItemProperty -Path $runOnce -Name $env:AKAN_NATIVE_RECOVER_NAME -Value $env:AKAN_NATIVE_RECOVER
  } catch {}
}
$done = @()
try {
  foreach ($m in $moves) {
    for ($i = 0; ; $i++) { try { Move-Item -LiteralPath $m[0] -Destination $m[1]; break } catch { if ($i -ge 40) { throw }; Start-Sleep -Milliseconds 250 } }
    $done = ,$m + $done
  }
} catch {
  foreach ($m in $done) { try { Move-Item -LiteralPath $m[1] -Destination $m[0] } catch {} }
}
if ($env:AKAN_NATIVE_RECOVER) { Remove-ItemProperty -Path $runOnce -Name $env:AKAN_NATIVE_RECOVER_NAME -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds ([int]$env:AKAN_NATIVE_DELAY_MS)
Start-Process -NoNewWindow -WorkingDirectory $env:AKAN_NATIVE_CWD -FilePath $env:AKAN_NATIVE_EXE
`;
  let recovery: Record<string, string> = {};
  const command = recover && moves.length > 0 ? recoveryCommand(recover.script) : null;
  if (recover && command) {
    try {
      mkdirSync(dirname(recover.script), { recursive: true });
      writeFileSync(recover.script, `\uFEFF${recoveryScript(exe, moves)}`);
      recovery = { AKAN_NATIVE_RECOVER: command, AKAN_NATIVE_RECOVER_NAME: recover.name };
    } catch (error) {
      console.warn("[akan-native] cannot write the swap's recovery script", error);
    }
  } else if (recover && moves.length > 0)
    console.warn(`[akan-native] ${recover.script} is too long a path for RunOnce`);
  // Bun (libuv) puts its children in a job object that ends them when this app exits, and a
  // detached child (DETACHED_PROCESS, no console) is powershell.exe exiting at once without
  // running anything (Windows 11 26200). The job lets a child's own children break away, so a
  // windowless cmd.exe starts the helper with `start /b` and returns; the app waits for that, or
  // its exit would end cmd.exe before the helper started. -EncodedCommand: base64, nothing in it
  // for cmd to parse.
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  //? Windows renames no folder that is a process's working folder. An app started from its install folder
  //? (the installer, a shortcut, Explorer) would pass that folder on to the helper, which could then never move
  //? it, and to the app it starts, which would block the next update the same way.
  const cwd = tmpdir();
  const env = {
    ...inherited,
    AKAN_NATIVE_PARENT: String(process.pid),
    AKAN_NATIVE_EXE: exe,
    AKAN_NATIVE_MOVES: JSON.stringify(moves),
    AKAN_NATIVE_DELAY_MS: String(delayMs),
    AKAN_NATIVE_CWD: cwd,
    ...recovery,
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
    child = spawn("cmd.exe", args, { cwd, stdio: "inherit", windowsHide: true, env });
  } catch {
    child = spawn("cmd.exe", args, { cwd, stdio: "ignore", windowsHide: true, env }); // an app without standard handles
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(done, 2_500); // within the plugin setup's 3 s (a rollback at launch)
    child.once("exit", done);
    child.once("error", (error) => {
      console.error("[akan-native] cannot start the relaunch helper", error);
      done();
    });
  });
}

/** Relaunches after the browser process ended, in a row: each one's app ran less than RELAUNCH_HEALTHY. */
export const RELAUNCH_LIMIT = 10;
export const RELAUNCH_HEALTHY = 60_000;

interface RelaunchRecord {
  streak: number;
  /** When the last relaunched app was due to start (epoch ms). */
  startsAt: number;
}

/**
 * desktop.recovery "reload" after the webview's browser process ended: how long the relaunched app waits, or null
 * once RELAUNCH_LIMIT relaunches in a row did not help. The first relaunch is immediate, then 1 s doubling to a
 * minute (lib.rs recovery_wait); an app that ran for RELAUNCH_HEALTHY starts the count again. `file` keeps the
 * count across the processes.
 */
export function nextRelaunchDelay(file: string, now = Date.now()): number | null {
  let last: RelaunchRecord | null = null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<RelaunchRecord>;
    if (typeof raw.streak === "number" && typeof raw.startsAt === "number")
      last = { streak: raw.streak, startsAt: raw.startsAt };
  } catch {}
  const streak = last && now - last.startsAt < RELAUNCH_HEALTHY ? last.streak + 1 : 0;
  if (streak >= RELAUNCH_LIMIT) return null;
  const delay = streak === 0 ? 0 : Math.min(1000 * 2 ** Math.min(streak - 1, 6), 60_000);
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ streak, startsAt: now + delay } satisfies RelaunchRecord));
  } catch (error) {
    console.warn("[akan-native] cannot record the relaunch", error);
  }
  return delay;
}

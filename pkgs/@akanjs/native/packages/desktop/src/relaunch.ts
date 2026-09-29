// Starting the app again once this process has exited: an update's swap (plugins/updates), app.relaunch(),
// and desktop.recovery "reload" when the webview's browser process ends (host.ts). The new process must not
// start while this one runs: single-instance would hand it over to this one, and locks are still held.
import { spawn } from "node:child_process";
import { renameSync } from "node:fs";

/**
 * Once this process has exited: renames `moves` in order and starts `exe` with this environment. macOS and
 * Linux rename a running app's folder right away, so only the start waits; Windows refuses that, so a helper
 * does the renames too (and on a failed rename puts back what it moved, so there is always an app to start).
 */
export function relaunchAfterExit(exe: string, moves: [string, string][] = []): Promise<void> {
  //? The CLI's contract with the app it started (lib.rs stdin_quit): nobody holds the new app's stdin, and
  //? reading it closed would quit it at once.
  const { AKAN_NATIVE_QUIT_ON_STDIN: _cli, ...inherited } = process.env;
  if (process.platform !== "win32") {
    for (const [from, to] of moves) renameSync(from, to);
    const child = spawn(
      "/bin/sh",
      ["-c", 'while kill -0 "$AKAN_NATIVE_PARENT" 2>/dev/null; do sleep 0.2; done; exec "$AKAN_NATIVE_EXE"'],
      {
        detached: true,
        stdio: "inherit",
        env: { ...inherited, AKAN_NATIVE_PARENT: String(process.pid), AKAN_NATIVE_EXE: exe },
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
    ...inherited,
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
      console.error("[akan-native] cannot start the relaunch helper", error);
      done();
    });
  });
}

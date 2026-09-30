// Runs commands in the Windows VM over SSH on a copy of this repository
// (docs/testing-windows-linux.md; the VM was prepared with scripts/vm/windows-setup.ps1):
//
//   bun scripts/vm/windows.ts sync                     copy the repository to the VM
//   bun scripts/vm/windows.ts ssh <command…>           run in the SSH session (builds, cargo, bun test)
//   bun scripts/vm/windows.ts desktop <command…>       run in the signed-in desktop session and wait
//   bun scripts/vm/windows.ts test                     sync, then `akan-native test windows` on the desktop
//   bun scripts/vm/windows.ts screenshot [file.png]    the VM's screen, copied here
//
// Commands run in PowerShell in C:\akan-native-work\akan-native. An SSH session has no desktop: windows it opens
// are invisible and WebView2 does not render there, so anything that shows a window goes through
// `desktop`: a scheduled task that runs only in the signed-in user's session (schtasks /IT),
// writes its output to a log that this script follows, and records its exit code. The task runs
// as a user starts an app (/RL LIMITED: not elevated like the SSH session) and without a console
// window over the app (conhost --headless).
// The VM's address and user come from ~/.akan/native/vm/windows.json (written by serve-setup.ts) or
// AKAN_NATIVE_VM_HOST / AKAN_NATIVE_VM_USER; the key is ~/.akan/native/vm/id_ed25519.
// AKAN_NATIVE_VM_SRC copies another tree instead of this package (the akanjs monorepo, for an e2e that builds an
// app), into C:\akan-native-work\<AKAN_NATIVE_VM_WORK_NAME>, so it never mixes with this package's copy.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PACKAGE = resolve(import.meta.dir, "../..");
const REPO = resolve(process.env.AKAN_NATIVE_VM_SRC ?? PACKAGE);
const VM_DIR = join(homedir(), ".akan", "native", "vm");
const WORK = "C:\\akan-native-work";
// robocopy /MIR onto the copy: another tree mirrored onto this package's copy would delete it, and a name that is
// empty or only dots would mirror onto the work root or above it. Windows ignores a folder name's case and trailing
// dots, so `Akan-Native.` is this package's copy too.
if (process.env.AKAN_NATIVE_VM_SRC && !process.env.AKAN_NATIVE_VM_WORK_NAME)
  throw new Error("AKAN_NATIVE_VM_SRC copies another tree: name its copy with AKAN_NATIVE_VM_WORK_NAME");
const COPY = (process.env.AKAN_NATIVE_VM_WORK_NAME || "akan-native")
  .replace(/[^A-Za-z0-9._-]/g, "")
  .replace(/\.+$/, "");
if (!/[A-Za-z0-9]/.test(COPY))
  throw new Error(`AKAN_NATIVE_VM_WORK_NAME names no folder: ${JSON.stringify(process.env.AKAN_NATIVE_VM_WORK_NAME)}`);
if (REPO !== PACKAGE && COPY.toLowerCase() === "akan-native")
  throw new Error(
    `AKAN_NATIVE_VM_SRC copies another tree (${REPO}): akan-native is this package's copy, name another one`,
  );

function target(): string {
  let host = process.env.AKAN_NATIVE_VM_HOST;
  let user = process.env.AKAN_NATIVE_VM_USER;
  const report = join(VM_DIR, "windows.json");
  if ((!host || !user) && existsSync(report)) {
    const r = JSON.parse(readFileSync(report, "utf8")) as { user?: string; ips?: string[]; from?: string };
    host ??= r.from?.replace(/^::ffff:/, "") ?? r.ips?.[0];
    user ??= r.user;
  }
  if (!host || !user)
    throw new Error(
      "no VM address: run scripts/vm/windows-setup.ps1 in the VM, or set AKAN_NATIVE_VM_HOST and AKAN_NATIVE_VM_USER",
    );
  return `${user}@${host}`;
}

const SSH = [
  "-i",
  join(VM_DIR, "id_ed25519"),
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  `UserKnownHostsFile=${join(VM_DIR, "known_hosts")}`,
  "-o",
  "BatchMode=yes",
];

function spawn(cmd: string[], opts: { quiet?: boolean; input?: string } = {}): { code: number; out: string } {
  const p = Bun.spawnSync(cmd, {
    stdin: opts.input === undefined ? "inherit" : new TextEncoder().encode(opts.input),
    stdout: opts.quiet ? "pipe" : "inherit",
    stderr: opts.quiet ? "pipe" : "inherit",
  });
  return { code: p.exitCode, out: opts.quiet ? `${p.stdout ?? ""}${p.stderr ?? ""}` : "" };
}

/**
 * PowerShell on the VM: the script goes as base64 UTF-16, so nothing needs quoting, and the SSH
 * shell (PowerShell) runs it itself. Not a nested `powershell -EncodedCommand`: that one writes
 * errors to stderr as CLIXML and exits 1 whatever the script's `exit` said.
 */
function ps(script: string, quiet = false): { code: number; out: string } {
  const encoded = Buffer.from(
    `$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`,
    "utf16le",
  ).toString("base64");
  return spawn(
    ["ssh", ...SSH, target(), `iex ([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}')))`],
    { quiet },
  );
}

/** What kind of tree REPO is (its root package's name): a copy mirrors one kind only. */
function treeName(): string {
  try {
    const { name } = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { name?: unknown };
    if (typeof name === "string" && /^[@\w./-]+$/.test(name)) return name;
  } catch {
    // No readable package.json: named below by whether it is this package.
  }
  return REPO === PACKAGE ? "@akanjs/native" : "an unnamed tree";
}

function sync(): void {
  const archive = join(tmpdir(), `${COPY}-sync.tar.gz`);
  const tree = treeName();
  console.info("sync: packing the repository");
  //? .git, .claude (its worktrees) and local are gigabytes in the monorepo and nothing a VM build reads; no tracked
  //? folder carries one of these names.
  const excludes = ["node_modules", "target", ".akan", "dist", ".DS_Store", ".git", ".claude", "local"].flatMap((e) => [
    "--exclude",
    e,
  ]);
  if (spawn(["tar", "-czf", archive, ...excludes, "-C", REPO, "."], { quiet: true }).code !== 0)
    throw new Error("tar failed");
  if (spawn(["scp", ...SSH, "-q", archive, `${target()}:${COPY}-sync.tar.gz`]).code !== 0)
    throw new Error("scp failed");
  rmSync(archive, { force: true });
  // Mirror the sources, keeping what the VM built (node_modules, target, .akan, dist) for
  // incremental builds: robocopy /MIR leaves excluded folders alone. Exit codes below 8 are success.
  //? Beside the copy, what it was mirrored from: another kind of tree mirrored onto it (this package onto a monorepo copy,
  //? or the other way) would delete everything the two do not share.
  const r = ps(`
$ErrorActionPreference = 'Stop'
$marker = '${WORK}\\${COPY}.source'
if ((Test-Path $marker) -and ((Get-Content -Raw $marker).Trim() -ne '${tree}')) {
  throw "${WORK}\\${COPY} is a copy of $((Get-Content -Raw $marker).Trim()), not ${tree}: name another copy with AKAN_NATIVE_VM_WORK_NAME, or remove $marker"
}
$staging = '${WORK}\\sync-${COPY}'
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $staging
New-Item -ItemType Directory -Force -Path $staging, '${WORK}\\${COPY}' | Out-Null
tar.exe -xzf "$HOME\\${COPY}-sync.tar.gz" -C $staging
# A partial unpack mirrored with /MIR would delete the sources it missed from the work copy.
if ($LASTEXITCODE -ne 0) { throw "tar failed with $LASTEXITCODE" }
Remove-Item "$HOME\\${COPY}-sync.tar.gz"
robocopy.exe $staging '${WORK}\\${COPY}' /MIR /XD node_modules target .akan dist .git .claude local /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with $LASTEXITCODE" }
Remove-Item -Recurse -Force $staging
Set-Content -NoNewline -Path $marker -Value '${tree}'
Set-Location '${WORK}\\${COPY}'
if (-not (Test-Path node_modules)) { & "$HOME\\.bun\\bin\\bun.exe" install --silent | Out-Null }
exit 0
`);
  if (r.code !== 0) throw new Error("extracting on the VM failed");
}

/**
 * Runs `command` (PowerShell) in the signed-in desktop session and follows its output. `name` names
 * the task and its files, so a second one (a screenshot) can run while a test is running.
 */
async function desktop(
  command: string,
  name = COPY === "akan-native" ? "desktop" : `${COPY}-desktop`,
): Promise<number> {
  const base = `${WORK}\\${name}`;
  // Continue: PowerShell 5.1 turns a native program's stderr lines into errors, which Stop would
  // make fatal. UTF-8: how PowerShell decodes native programs' output (the OEM code page otherwise).
  // Add-Content per line, so the log grows while the command runs.
  const script = `
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$env:PATH = "$HOME\\.bun\\bin;$HOME\\.cargo\\bin;$env:PATH"
Set-Location '${WORK}\\${COPY}'
& { ${command} } *>&1 | ForEach-Object { Add-Content -Encoding utf8 -Path '${base}.log' -Value "$_" }
exit $LASTEXITCODE
`;
  const r = ps(
    `
$ErrorActionPreference = 'Stop'
Remove-Item -Force -ErrorAction SilentlyContinue '${base}.log', '${base}.exit'
[IO.File]::WriteAllText('${base}.ps1', [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(script, "utf8").toString("base64")}')))
Set-Content -Encoding ascii -Path '${base}.cmd' -Value '@powershell -NoProfile -ExecutionPolicy Bypass -File ${base}.ps1', '@echo %ERRORLEVEL% > ${base}.exit'
schtasks.exe /Create /F /TN akan-native-${name} /SC ONCE /ST 00:00 /IT /RL LIMITED /TR 'conhost.exe --headless ${base}.cmd' | Out-Null
schtasks.exe /Run /TN akan-native-${name} | Out-Null
'started'
`,
    true,
  );
  if (r.code !== 0) {
    console.error(r.out);
    return 1;
  }
  // Follow the log until the exit code appears.
  let offset = 0;
  for (;;) {
    await Bun.sleep(2000);
    const poll = ps(
      `
$log = '${base}.log'
$out = ''
if (Test-Path $log) {
  $s = [IO.File]::Open($log, 'Open', 'Read', 'ReadWrite'); $s.Position = ${offset}; $b = New-Object byte[] ($s.Length - $s.Position); [void]$s.Read($b, 0, $b.Length); $s.Close()
  $out = [Convert]::ToBase64String($b)
}
$exit = if (Test-Path '${base}.exit') { (Get-Content '${base}.exit').Trim() } else { '' }
"$out|$exit"
`,
      true,
    );
    if (poll.code !== 0) continue;
    const [data = "", exit = ""] = poll.out.trim().split("|");
    const bytes = Buffer.from(data, "base64");
    offset += bytes.length;
    if (bytes.length) process.stdout.write(bytes.toString("utf8").replace(/^\uFEFF/, ""));
    if (exit) return Number.parseInt(exit, 10) || (exit.startsWith("0") ? 0 : 1);
  }
}

/** Saves the VM's screen (every monitor, in pixels) as a PNG at `file` on this machine. */
async function screenshot(file: string): Promise<number> {
  const code = await desktop(
    `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -Name Dpi -Namespace AkanNative -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
[void][AkanNative.Dpi]::SetProcessDPIAware()
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$bmp.Save('${WORK}\\screen.png', [System.Drawing.Imaging.ImageFormat]::Png)
"$($b.Width)x$($b.Height)"
exit 0
`,
    "screenshot",
  );
  if (code !== 0) return code;
  if (spawn(["scp", ...SSH, "-q", `${target()}:${WORK.replace(/\\/g, "/")}/screen.png`, file]).code !== 0) return 1;
  console.info(file);
  return 0;
}

const [sub, ...rest] = process.argv.slice(2);
if (sub === "sync") sync();
else if (sub === "ssh")
  process.exit(
    ps(
      `$env:PATH = "$HOME\\.bun\\bin;$HOME\\.cargo\\bin;$env:PATH"; Set-Location '${WORK}\\${COPY}'; ${rest.join(" ")}; exit $LASTEXITCODE`,
    ).code,
  );
else if (sub === "desktop") process.exit(await desktop(rest.join(" ")));
else if (sub === "screenshot") process.exit(await screenshot(rest[0] ?? join(tmpdir(), "akan-native-vm-screen.png")));
else if (sub === "test") {
  sync();
  process.exit(
    await desktop(`bun run akan-native test windows --app examples\\sample ${rest.join(" ")}; exit $LASTEXITCODE`),
  );
} else {
  console.error(
    "usage: bun scripts/vm/windows.ts sync | ssh <command…> | desktop <command…> | test [akan-native test flags] | screenshot [file.png]",
  );
  process.exit(2);
}

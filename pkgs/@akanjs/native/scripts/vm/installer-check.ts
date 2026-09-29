// End-to-end check of the Windows installer (docs/testing-windows-linux.md):
//
//   bun scripts/vm/windows.ts desktop 'bun scripts/vm/installer-check.ts'
//
// Builds the sample with --installer (NSIS must be installed: winget install NSIS.NSIS), then
// 1. installs it silently with /S /RUN: the app folder under %LOCALAPPDATA%\Programs, the Start menu
//    shortcut, the uninstall entry, and the app started,
// 2. installs it again over the running app: the copy running from the folder is stopped first,
// 3. uninstalls it silently: the folder, the shortcut and the entry are gone.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sampleConfig from "../../examples/sample/akan-native.config.ts";
import { build } from "../../packages/cli/src/api.ts";

if (process.platform !== "win32") throw new Error("installer-check installs a Windows program: run it on Windows");

const sample = resolve(import.meta.dir, "../../examples/sample");
const scratch = mkdtempSync(join(tmpdir(), "akan-native-installer-check-"));
const step = (text: string) => console.info(`\n== ${text}`);
const { name, id, fileName = id.split(".").pop() } = sampleConfig.app;
const installDir = join(process.env.LOCALAPPDATA ?? "", "Programs", name);
const exe = join(installDir, `${fileName}.exe`);
const shortcut = join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", `${name}.lnk`);
const uninstallKey = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${id}`;

function powershell(command: string): string {
  const p = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return p.stdout.toString().trim();
}

const runningFromInstall = () =>
  powershell(`(Get-Process | Where-Object { $_.Path -eq '${exe.replace(/'/g, "''")}' }).Id -join ','`)
    .split(",")
    .filter(Boolean)
    .map(Number);

async function until<T>(what: string, check: () => T | undefined | false, timeout = 30_000): Promise<T> {
  for (const started = Date.now(); Date.now() - started < timeout; await Bun.sleep(250)) {
    const value = check();
    if (value) return value;
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function runSetup(setup: string, ...args: string[]) {
  const p = Bun.spawn([setup, ...args], { stdout: "ignore", stderr: "ignore" });
  const code = await p.exited;
  if (code !== 0) throw new Error(`${setup} ${args.join(" ")} exited with ${code}`);
}

try {
  step("build the sample with its installer");
  const { artifacts } = await build({
    appDir: sample,
    config: sampleConfig,
    platform: "windows",
    profile: "release",
    outDir: join(scratch, "build"),
    windows: { installer: true },
  });
  const setup = artifacts.find((a) => a.kind === "installer")?.path;
  if (!setup) throw new Error(`no installer in ${JSON.stringify(artifacts)}`);
  console.info(`  ${setup}`);

  step("1. a silent install with /RUN");
  await runSetup(setup, "/S", "/RUN");
  if (!existsSync(exe)) throw new Error(`${exe} was not installed`);
  if (!existsSync(shortcut)) throw new Error(`no Start menu shortcut ${shortcut}`);
  const entry = powershell(`(Get-ItemProperty -LiteralPath '${uninstallKey}').DisplayName`);
  if (entry !== name) throw new Error(`the uninstall entry says ${JSON.stringify(entry)}`);
  const [first] = await until("the app it started", () => {
    const pids = runningFromInstall();
    return pids.length ? pids : undefined;
  });
  console.info(`  installed in ${installDir}, entry "${entry}", app ${first}`);

  step("2. installing again over the running app");
  await runSetup(setup, "/S");
  if (runningFromInstall().includes(first ?? -1)) throw new Error(`the running app ${first} was not stopped`);
  if (!existsSync(exe)) throw new Error("the reinstall left no app");
  console.info(`  app ${first} stopped, ${exe} in place`);

  step("3. a silent uninstall");
  await runSetup(join(installDir, "uninstall.exe"), "/S");
  await until("the folder to go", () => !existsSync(installDir));
  if (existsSync(shortcut)) throw new Error("the shortcut is still there");
  if (powershell(`Test-Path -LiteralPath '${uninstallKey}'`) !== "False") throw new Error("the entry is still there");
  console.info("  folder, shortcut and entry gone");
  console.info("\ninstaller-check passed");
} finally {
  for (const pid of runningFromInstall()) process.kill(pid);
  rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

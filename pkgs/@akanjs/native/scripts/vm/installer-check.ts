// End-to-end check of the Windows installer (docs/testing-windows-linux.md):
//
//   bun scripts/vm/windows.ts desktop 'bun scripts/vm/installer-check.ts'
//
// Builds the sample with --installer (NSIS must be installed: winget install NSIS.NSIS), signed for updates with a
// throwaway key and served from 127.0.0.1, publishes release A (the next patch version), then
// 1. installs it silently with /S /RUN: the app folder under %LOCALAPPDATA%\Programs, the Start menu
//    shortcut, the uninstall entry, and the app started,
// 2. lets the app the installer started take A, as a deployed one would: applied, confirmed, the uninstaller beside
//    the folder still there, and the entry showing A's version,
// 3. installs it again over the running app: the copy running from the folder is stopped first, and a junction in the
//    folder goes with the old folder while the files it pointed to stay,
// 4. a setup that cannot start (another setup holds the lock, or a file sits where it unpacks) fails with 2 and never
//    stops the running app; an uninstall while the lock is held fails with 2 too,
// 5. a setup with /RUN that cannot swap the folder (another program works in it) fails with 2, leaves the installed
//    build as it was and starts it again,
// 6. uninstalls it silently: the folder, what updates and setups left beside it, the uninstaller, the shortcut, the
//    entry, the launch at login, the shell's update state (a debug build's too) and an update's RunOnce recovery,
//    the deep link scheme the app registered and its notification id are gone, and the server's data and what
//    junctions pointed to stay,
// 7. installs it with /D= elsewhere, then again without /D=: the second setup replaces the app where it is and makes
//    no copy in the default folder; the uninstall leaves a scheme another program took over.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import sampleConfig from "../../examples/sample/akan-native.config.ts";
import { build, publishUpdate, updateKeygen } from "../../packages/cli/src/api.ts";

if (process.platform !== "win32") throw new Error("installer-check installs a Windows program: run it on Windows");

const sample = resolve(import.meta.dir, "../../examples/sample");
const scratch = mkdtempSync(join(tmpdir(), "akan-native-installer-check-"));
const step = (text: string) => console.info(`\n== ${text}`);
const { name, id, version, fileName = id.split(".").pop() } = sampleConfig.app;
const installDir = join(process.env.LOCALAPPDATA ?? "", "Programs", name);
const uninstaller = `${installDir}.uninstall.exe`;
const exe = join(installDir, `${fileName}.exe`);
const shortcut = join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs", `${name}.lnk`);
const uninstallKey = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${id}`;
const runKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const runOnceKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce";
const aumidKey = `HKCU:\\Software\\Classes\\AppUserModelId\\${id}`;
const schemes = sampleConfig.deepLinks?.schemes ?? [];
const localData = join(process.env.LOCALAPPDATA ?? "", id);
const nextVersion = version.replace(/\d+$/, (patch) => String(Number(patch) + 1));

function powershell(command: string): string {
  const p = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return p.stdout.toString().trim();
}

const quoted = (text: string) => text.replace(/'/g, "''");

const runningFromInstall = () =>
  powershell(`(Get-Process | Where-Object { $_.Path -eq '${quoted(exe)}' }).Id -join ','`)
    .split(",")
    .filter(Boolean)
    .map(Number);

const entryValue = (value: string) => powershell(`(Get-ItemProperty -LiteralPath '${uninstallKey}').${value}`);

const schemeCommand = (scheme: string) =>
  powershell(
    `(Get-Item -LiteralPath 'HKCU:\\Software\\Classes\\${scheme}\\shell\\open\\command' -ErrorAction SilentlyContinue).GetValue('')`,
  );

const installedBuild = (): number | undefined => {
  try {
    return (
      JSON.parse(readFileSync(join(installDir, "resources", "updates.json"), "utf8")) as { embeddedSequence: number }
    ).embeddedSequence;
  } catch {
    return undefined; // mid-swap: the folder is being renamed
  }
};

async function until<T>(what: string, check: () => T | undefined | false, timeout = 30_000): Promise<T> {
  for (const started = Date.now(); Date.now() - started < timeout; await Bun.sleep(250)) {
    const value = check();
    if (value) return value;
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function runSetup(setup: string, args: string[], env: Record<string, string> = {}, expected = 0) {
  const p = Bun.spawn([setup, ...args], { stdout: "ignore", stderr: "ignore", env: { ...process.env, ...env } });
  const code = await p.exited;
  if (code !== expected) throw new Error(`${setup} ${args.join(" ")} exited with ${code}, not ${expected}`);
}

function junction(link: string, target: string) {
  const made = powershell(`(New-Item -ItemType Junction -Path '${quoted(link)}' -Target '${quoted(target)}').LinkType`);
  if (made !== "Junction") throw new Error(`could not make a junction at ${link}`);
}

const leftBeside = () =>
  [".setup-new", ".setup-old", ".setup-uninstall.exe"].map((s) => `${installDir}${s}`).filter((p) => existsSync(p));

const out = join(scratch, "updates");
mkdirSync(out, { recursive: true });
const releases = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(req) {
    const file = resolve(out, `.${decodeURIComponent(new URL(req.url).pathname)}`);
    if (!file.startsWith(out + sep) || !existsSync(file) || statSync(file).isDirectory())
      return new Response("not found", { status: 404 });
    return new Response(Bun.file(file), { headers: { "cache-control": "no-store" } });
  },
});

try {
  process.env.AKAN_NATIVE_UPDATE_KEY = join(scratch, "update.key");
  const { publicKey } = updateKeygen({ config: sampleConfig });
  const config = {
    ...sampleConfig,
    updates: { ...sampleConfig.updates, url: `http://127.0.0.1:${releases.port}`, publicKey },
  };
  for (const base of [process.env.APPDATA ?? "", process.env.LOCALAPPDATA ?? ""])
    rmSync(join(base, id, "akan-native-updates"), { recursive: true, force: true });

  step("build the sample with its installer, then publish release A");
  const { artifacts } = await build({
    appDir: sample,
    config,
    platform: "windows",
    profile: "release",
    outDir: join(scratch, "build"),
    windows: { installer: true },
  });
  const setup = artifacts.find((a) => a.kind === "installer")?.path;
  if (!setup) throw new Error(`no installer in ${JSON.stringify(artifacts)}`);
  console.info(`  ${setup}`);
  await Bun.sleep(1100); // sequences are seconds: A must be later than the installed build
  const published = await publishUpdate({
    appDir: sample,
    config: { ...config, app: { ...config.app, version: nextVersion } },
    platform: "windows",
    outDir: join(scratch, "release"),
    out,
  });
  const releaseA = JSON.parse(readFileSync(join(published.dir, `${published.channel}.json`), "utf8")) as {
    build: number;
  };
  console.info(`  release ${published.bundle} (build ${releaseA.build})`);

  step("1. a silent install with /RUN");
  await runSetup(setup, ["/S", "/RUN"], { AKAN_NATIVE_PUBLIC_UPDATE_PROBE: "apply" });
  if (!existsSync(exe)) throw new Error(`${exe} was not installed`);
  if (!existsSync(uninstaller)) throw new Error(`no uninstaller at ${uninstaller}`);
  if (!existsSync(shortcut)) throw new Error(`no Start menu shortcut ${shortcut}`);
  const entry = entryValue("DisplayName");
  if (entry !== name) throw new Error(`the uninstall entry says ${JSON.stringify(entry)}`);
  const [first] = await until("the app it started", () => {
    const pids = runningFromInstall();
    return pids.length ? pids : undefined;
  });
  console.info(`  installed in ${installDir}, entry "${entry}", app ${first}`);

  step("2. the app the installer started takes release A");
  const [updated] = await until(
    "release A to be applied and confirmed",
    () => {
      if (installedBuild() !== releaseA.build || existsSync(`${installDir}.previous`)) return undefined;
      const pids = runningFromInstall();
      return pids.length ? pids : undefined;
    },
    120_000,
  );
  if (!existsSync(uninstaller)) throw new Error("the update took the uninstaller with the old folder");
  await until("the entry to show A's version", () => entryValue("DisplayVersion") === nextVersion);
  console.info(`  app ${updated} runs A, the uninstaller stays, the entry says ${nextVersion}`);

  step("3. installing again over the running app, with a junction in its folder");
  const outside = join(scratch, "outside");
  const kept = join(outside, "keep.txt");
  mkdirSync(outside, { recursive: true });
  writeFileSync(kept, "");
  junction(join(installDir, "media"), outside);
  await runSetup(setup, ["/S"]);
  if (runningFromInstall().includes(updated ?? -1)) throw new Error(`the running app ${updated} was not stopped`);
  if (!existsSync(exe)) throw new Error("the reinstall left no app");
  if (!existsSync(kept)) throw new Error("the reinstall emptied the folder a junction in the app pointed to");
  if (existsSync(join(installDir, "media"))) throw new Error("the new folder still holds the old folder's junction");
  console.info(`  app ${updated} stopped, ${exe} in place, the junction's target kept`);

  Bun.spawn([exe], { cwd: process.env.LOCALAPPDATA, stdout: "ignore", stderr: "ignore" });
  const [running] = await until("the app started again", () => {
    const pids = runningFromInstall();
    return pids.length ? pids : undefined;
  });
  const buildBefore = installedBuild();

  step("4. a setup that cannot start");
  const marker = join(scratch, "lock-held");
  const lock = Bun.spawn(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$m = New-Object System.Threading.Mutex($false, 'Local\\akan-native-setup-${id}'); Set-Content -LiteralPath '${quoted(marker)}' held; Start-Sleep 120`,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  try {
    await until("another process to hold the setup lock", () => existsSync(marker));
    await runSetup(setup, ["/S", "/RUN"], {}, 2);
    await runSetup(uninstaller, ["/S", `_?=${process.env.SystemDrive ?? "C:"}\\`], {}, 2);
  } finally {
    lock.kill();
    await lock.exited;
  }
  if (!runningFromInstall().includes(running ?? -1)) throw new Error(`the running app ${running} was stopped`);
  if (installedBuild() !== buildBefore || !existsSync(uninstaller))
    throw new Error("the refused setup changed the app");
  if (leftBeside().length) throw new Error(`the refused setup left ${leftBeside().join(", ")}`);
  const blocker = "a file where the setup unpacks";
  writeFileSync(`${installDir}.setup-new`, blocker);
  await runSetup(setup, ["/S", "/RUN"], {}, 2);
  if (readFileSync(`${installDir}.setup-new`, "utf8") !== blocker) throw new Error("the setup changed that file");
  rmSync(`${installDir}.setup-new`, { force: true });
  if (!runningFromInstall().includes(running ?? -1)) throw new Error(`the running app ${running} was stopped`);
  if (installedBuild() !== buildBefore) throw new Error("the installed build changed");
  console.info(`  both exited with 2 (the lock, then the file), app ${running} still running`);

  step("5. a setup with /RUN that cannot swap the folder");
  const holder = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "Start-Sleep 300"], {
    cwd: installDir,
    stdout: "ignore",
    stderr: "ignore",
  });
  try {
    await runSetup(setup, ["/S", "/RUN"], {}, 2);
    if (!existsSync(exe) || installedBuild() !== buildBefore)
      throw new Error("the failed setup did not leave the app as it was");
    if (leftBeside().length) throw new Error(`the failed setup left ${leftBeside().join(", ")}`);
    const [again] = await until("the old app started again", () => {
      const pids = runningFromInstall().filter((pid) => pid !== running);
      return pids.length ? pids : undefined;
    });
    console.info(`  exited with 2, build ${buildBefore} in place, app ${running} stopped and ${again} started again`);
  } finally {
    holder.kill();
    await holder.exited;
  }

  step("6. a silent uninstall");
  const leftovers = [
    `${installDir}.previous`,
    `${installDir}.update-0.0.0-1`,
    `${installDir}.failed-1`,
    `${installDir}.setup-new`,
    `${installDir}.setup-old`,
    join(localData, "akan-native-updates"),
    join(localData, "akan-native-updates-debug"),
  ];
  for (const dir of leftovers) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "left.txt"), "");
  }
  writeFileSync(`${installDir}.setup-uninstall.exe`, "");
  leftovers.push(`${installDir}.setup-uninstall.exe`);
  junction(join(installDir, "media"), outside);
  junction(join(`${installDir}.setup-old`, "media"), outside);
  for (const scheme of schemes)
    await until(`the app to register its ${scheme}: scheme`, () => {
      const command = schemeCommand(scheme).toLowerCase();
      return command === `"${exe}" "%1"`.toLowerCase();
    });
  powershell(
    `New-Item -Force -Path '${aumidKey}' | Out-Null; New-ItemProperty -LiteralPath '${aumidKey}' -Name DisplayName -Value '${quoted(name)}' -Force | Out-Null`,
  );
  const icon = join(localData, "notification-icon.png");
  writeFileSync(icon, "");
  const recovery = `akan-native-update ${id}`;
  const recoveryLeft = () =>
    powershell(
      `$null -ne (Get-ItemProperty -LiteralPath '${runOnceKey}' -Name '${recovery}' -ErrorAction SilentlyContinue)`,
    ) === "True";
  powershell(
    `if (-not (Test-Path -LiteralPath '${runOnceKey}')) { New-Item -Path '${runOnceKey}' | Out-Null }; New-ItemProperty -LiteralPath '${runOnceKey}' -Name '${recovery}' -Value 'cmd.exe /d /c exit' -PropertyType String -Force | Out-Null`,
  );
  if (!recoveryLeft()) throw new Error("could not leave an update's recovery command in RunOnce");
  const serverDir = join(localData, "server");
  const serverData = join(serverDir, "installer-check.txt");
  const serverDirExisted = existsSync(serverDir);
  mkdirSync(serverDir, { recursive: true });
  writeFileSync(serverData, "");
  const startsAtLogin = () =>
    powershell(`$null -ne (Get-ItemProperty -LiteralPath '${runKey}' -Name '${id}' -ErrorAction SilentlyContinue)`) ===
    "True";
  powershell(
    `New-ItemProperty -LiteralPath '${runKey}' -Name '${id}' -Value '"${quoted(exe)}"' -PropertyType String -Force | Out-Null`,
  );
  if (!startsAtLogin()) throw new Error("could not register the app to start at login");
  await runSetup(uninstaller, ["/S"]);
  await until("the folder to go", () => !existsSync(installDir));
  await until("the uninstaller to go", () => !existsSync(uninstaller));
  const left = leftovers.filter((dir) => existsSync(dir));
  if (left.length) throw new Error(`left next to the folder: ${left.join(", ")}`);
  if (existsSync(shortcut)) throw new Error("the shortcut is still there");
  if (powershell(`Test-Path -LiteralPath '${uninstallKey}'`) !== "False") throw new Error("the entry is still there");
  if (startsAtLogin()) throw new Error("the app still starts at login");
  const linked = schemes.filter((scheme) => schemeCommand(scheme) !== "");
  if (linked.length) throw new Error(`the uninstall left the deep link scheme ${linked.join(", ")}`);
  if (powershell(`Test-Path -LiteralPath '${aumidKey}'`) !== "False" || existsSync(icon))
    throw new Error("the uninstall left the notification registration");
  if (recoveryLeft()) throw new Error("the uninstall left an update's recovery command in RunOnce");
  if (!existsSync(kept)) throw new Error("the uninstall emptied a folder a junction pointed to");
  if (!existsSync(serverData)) throw new Error("the uninstall took the server's data");
  rmSync(serverDirExisted ? serverData : serverDir, { recursive: true, force: true });
  console.info(
    "  folder, leftovers, uninstaller, shortcut, entry, launch at login, update state, link scheme and notification id gone; server data and junction targets kept",
  );

  step("7. a setup without /D= goes where the app is installed");
  const elsewhere = join(scratch, "installed elsewhere", name);
  // /D= takes the rest of the command line as the folder, unquoted: Start-Process passes its argument as it is.
  const code = powershell(
    `(Start-Process -FilePath '${quoted(setup)}' -ArgumentList '/S /D=${quoted(elsewhere)}' -Wait -PassThru).ExitCode`,
  );
  if (code !== "0") throw new Error(`the /D= install exited with ${code}`);
  if (!existsSync(join(elsewhere, `${fileName}.exe`)) || existsSync(installDir))
    throw new Error(`the /D= install is not (only) in ${elsewhere}`);
  await runSetup(setup, ["/S"]);
  if (existsSync(installDir)) throw new Error("a setup without /D= made a copy in the default folder");
  if (entryValue("InstallLocation") !== elsewhere) throw new Error("the entry no longer names the /D= folder");
  const other = '"C:\\Other Program\\other.exe" "%1"';
  for (const scheme of schemes)
    powershell(
      `$k = 'HKCU:\\Software\\Classes\\${scheme}\\shell\\open\\command'; New-Item -Force -Path $k | Out-Null; Set-Item -LiteralPath $k -Value '${quoted(other)}'`,
    );
  await runSetup(`${elsewhere}.uninstall.exe`, ["/S"]);
  await until("the /D= folder and its uninstaller to go", () => !existsSync(`${elsewhere}.uninstall.exe`));
  if (existsSync(elsewhere)) throw new Error(`the uninstall left ${elsewhere}`);
  const taken = schemes.filter((scheme) => schemeCommand(scheme) !== other);
  for (const scheme of schemes) powershell(`Remove-Item -LiteralPath 'HKCU:\\Software\\Classes\\${scheme}' -Recurse`);
  if (taken.length) throw new Error(`the uninstall removed ${taken.join(", ")}, which another program had taken over`);
  console.info(`  reinstalled in ${elsewhere}, no copy in the default folder; another program's scheme kept`);
  console.info("\ninstaller-check passed");
} finally {
  for (const pid of runningFromInstall()) process.kill(pid);
  releases.stop(true);
  rmSync(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

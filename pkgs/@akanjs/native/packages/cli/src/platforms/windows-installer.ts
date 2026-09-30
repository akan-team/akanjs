// akan-native build windows --installer: an NSIS setup program around the app folder (CLI-9 installer).
//
// - Per user: %LOCALAPPDATA%\Programs\<name>, no administrator. The updates plugin swaps that folder by
//   renaming it and a sibling, which it could not do under Program Files without elevation.
// - `/S` installs silently (NSIS's own switch, what a remote update that runs setup.exe passes) and `/RUN`
//   starts the app after a silent install (an interactive one offers it on its last page); `/D=<dir>` picks
//   another folder. A silent install that could not finish exits non-zero.
// - WebView2: Windows 11 has it, and so does almost every Windows 10; LTSC editions do not. The installer
//   runs Microsoft's Evergreen Bootstrapper (embedded, 2 MB, it downloads the runtime) only when neither
//   the machine nor the user has one (docs: "Detect if a WebView2 Runtime is already installed").
// - A running copy in the folder is stopped first, by its path, so an unrelated program with the same
//   file name is left alone.
// - The folder is the app's: updates replace it whole, so the uninstaller lives beside it
//   (`<folder>.uninstall.exe`) and a reinstall or an uninstall removes all of it. A `/D=` folder must be empty
//   or hold the app already; without the app's executable in it only the entries this build made are removed.
// - The shortcut and the started app work in %LOCALAPPDATA%, not the app folder: Windows cannot rename a
//   folder that is some process's working directory, which is what an update does.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../lib/exec.ts";
import { CliError, log, ToolchainError } from "../lib/log.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { akanNativeHome } from "../lib/toolchains.ts";
import { hostArch } from "../lib/updates.ts";
import { windowsVersion } from "./windows.ts";

/** Microsoft's permanent link to the Evergreen Bootstrapper (MicrosoftEdgeWebview2Setup.exe). */
export const WEBVIEW2_BOOTSTRAPPER_URL = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
/** The WebView2 Runtime's EdgeUpdate client id; its `pv` value is the installed version. */
const WEBVIEW2_CLIENT = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
/** MAX_PATH less its NUL: what a PC without long paths enabled (the Windows default) can open or unpack. */
export const WINDOWS_MAX_PATH = 259;
/** `C:\Users\` + a 20-character user name + `\AppData\Local\Programs\`. */
const INSTALL_ROOT = "C:\\Users\\".length + 20 + "\\AppData\\Local\\Programs\\".length;
/** `.update-<version>-<sequence>\`: an update unpacks next to the app, under the app's name again, before the swap. */
const STAGING = ".update-".length + 24 + 1;

export interface InstallerInput {
  name: string;
  id: string;
  exe: string;
  version: string;
  build: number;
  /** The built app folder, copied whole. */
  folder: string;
  /** Its top-level files and folders: what an update or uninstall removes. */
  entries: { name: string; dir: boolean }[];
  icon?: string;
  bootstrapper: string;
  stopScript: string;
  outFile: string;
}

/** `$` is NSIS's variable sigil; the names that reach a script cannot hold a quote (config.ts app.name). */
const nsis = (value: string) => value.replace(/\$/g, "$$$$");

const removal = (entries: InstallerInput["entries"]) =>
  entries
    .map(({ name, dir }) => (dir ? `    RMDir /r "$INSTDIR\\${nsis(name)}"` : `    Delete "$INSTDIR\\${nsis(name)}"`))
    .join("\n");

export function installerScript(input: InstallerInput): string {
  const version = windowsVersion(input.version, input.build);
  const icon = input.icon ? `!define MUI_ICON "${nsis(input.icon)}"\n!define MUI_UNICON "${nsis(input.icon)}"\n` : "";
  return `Unicode true
ManifestDPIAware true
ManifestLongPathAware true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!define APP_NAME "${nsis(input.name)}"
!define EXE "${nsis(input.exe)}"
!define UNINSTALL_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${input.id}"
!define WEBVIEW2_KEY "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT}"

Name "\${APP_NAME}"
OutFile "${nsis(input.outFile)}"
InstallDir "$LOCALAPPDATA\\Programs\\\${APP_NAME}"
BrandingText "\${APP_NAME} ${nsis(input.version)}"
VIProductVersion "${version}"
VIAddVersionKey "ProductName" "\${APP_NAME}"
VIAddVersionKey "ProductVersion" "${nsis(input.version)}"
VIAddVersionKey "FileVersion" "${version}"
VIAddVersionKey "FileDescription" "\${APP_NAME} Setup"

${icon}!define MUI_FINISHPAGE_RUN "$INSTDIR\\\${EXE}"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Korean"

!macro Fail MESSAGE
  DetailPrint "\${MESSAGE}"
  \${IfNot} \${Silent}
    MessageBox MB_ICONSTOP|MB_OK "\${MESSAGE}"
  \${EndIf}
  SetErrorLevel 2
  Abort
!macroend

!macro RemoveApp
  \${If} \${FileExists} "$INSTDIR\\\${EXE}"
    RMDir /r "$INSTDIR"
  \${Else}
${removal(input.entries)}
  \${EndIf}
!macroend

!macro RemoveSiblings SUFFIX
  FindFirst $R0 $R1 "$INSTDIR.\${SUFFIX}*"
  \${DoWhile} $R1 != ""
    RMDir /r "$INSTDIR\\..\\$R1"
    FindNext $R0 $R1
  \${Loop}
  FindClose $R0
!macroend

Function WebView2Version
  SetRegView 64
  ReadRegStr $0 HKLM "\${WEBVIEW2_KEY}" "pv"
  SetRegView 32
  \${If} $0 == ""
  \${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKLM "\${WEBVIEW2_KEY}" "pv"
  \${EndIf}
  \${If} $0 == ""
  \${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKCU "\${WEBVIEW2_KEY}" "pv"
  \${EndIf}
  \${If} $0 == "0.0.0.0"
    StrCpy $0 ""
  \${EndIf}
FunctionEnd

Function EnsureWebView2
  Call WebView2Version
  \${If} $0 != ""
    DetailPrint "WebView2 Runtime $0"
    Return
  \${EndIf}
  DetailPrint "Installing the WebView2 Runtime"
  File "/oname=$PLUGINSDIR\\MicrosoftEdgeWebview2Setup.exe" "${nsis(input.bootstrapper)}"
  ExecWait '"$PLUGINSDIR\\MicrosoftEdgeWebview2Setup.exe" /silent /install' $1
  DetailPrint "WebView2 Runtime setup exited with $1"
  Call WebView2Version
  \${If} $0 != ""
    DetailPrint "WebView2 Runtime $0"
    Return
  \${EndIf}
  \${If} \${Silent}
    !insertmacro Fail "The WebView2 Runtime could not be installed (setup exited with $1), and \${APP_NAME} does not start without it."
  \${EndIf}
  MessageBox MB_ICONEXCLAMATION|MB_OKCANCEL "The WebView2 Runtime could not be installed (setup exited with $1), and \${APP_NAME} does not start without it. Install \${APP_NAME} anyway?" IDOK webview2_anyway
  SetErrorLevel 2
  Abort
webview2_anyway:
  DetailPrint "Installing without the WebView2 Runtime"
FunctionEnd

Section "Install"
  \${DirState} "$INSTDIR" $0
  \${If} $0 == 1
  \${AndIfNot} \${FileExists} "$INSTDIR\\\${EXE}"
  \${AndIf} "$INSTDIR" != "$LOCALAPPDATA\\Programs\\\${APP_NAME}"
    !insertmacro Fail "$INSTDIR holds other files. Install into an empty folder, or where \${APP_NAME} is installed."
  \${EndIf}
  InitPluginsDir
  File "/oname=$PLUGINSDIR\\stop-app.ps1" "${nsis(input.stopScript)}"
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\stop-app.ps1" "$INSTDIR"'
  Pop $0
  Call EnsureWebView2
  !insertmacro RemoveApp
  SetOutPath "$INSTDIR"
  ClearErrors
  File /r "${nsis(input.folder)}\\*"
  \${If} \${Errors}
    !insertmacro Fail "Some files could not be written under $INSTDIR. Windows refuses a path over 260 characters unless long paths are enabled."
  \${EndIf}
  ClearErrors
  WriteUninstaller "$INSTDIR.uninstall.exe"
  \${If} \${Errors}
    !insertmacro Fail "$INSTDIR.uninstall.exe could not be written: install into a folder under one this user may write to."
  \${EndIf}
  SetOutPath "$LOCALAPPDATA"
  CreateShortcut "$SMPROGRAMS\\\${APP_NAME}.lnk" "$INSTDIR\\\${EXE}"
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "DisplayName" "\${APP_NAME}"
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "DisplayVersion" "${nsis(input.version)}"
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\\\${EXE}"
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR.uninstall.exe"'
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR.uninstall.exe" /S'
  WriteRegDWORD HKCU "\${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "\${UNINSTALL_KEY}" "NoRepair" 1
  \${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "\${UNINSTALL_KEY}" "EstimatedSize" $0
  \${If} \${Silent}
    \${GetParameters} $0
    ClearErrors
    \${GetOptions} $0 "/RUN" $1
    \${IfNot} \${Errors}
      Exec '"$INSTDIR\\\${EXE}"'
    \${EndIf}
  \${EndIf}
SectionEnd

Function un.onInit
  ReadRegStr $INSTDIR HKCU "\${UNINSTALL_KEY}" "InstallLocation"
  \${If} $INSTDIR == ""
    \${IfNot} \${Silent}
      MessageBox MB_ICONSTOP|MB_OK "\${APP_NAME} is not installed for this user."
    \${EndIf}
    SetErrorLevel 2
    Abort
  \${EndIf}
FunctionEnd

Section "Uninstall"
  InitPluginsDir
  File "/oname=$PLUGINSDIR\\stop-app.ps1" "${nsis(input.stopScript)}"
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\stop-app.ps1" "$INSTDIR"'
  Pop $0
  Delete "$SMPROGRAMS\\\${APP_NAME}.lnk"
  RMDir /r "$INSTDIR.previous"
  !insertmacro RemoveSiblings "update-"
  !insertmacro RemoveSiblings "failed-"
  !insertmacro RemoveApp
  RMDir "$INSTDIR"
  Delete "$INSTDIR.uninstall.exe"
  DeleteRegKey HKCU "\${UNINSTALL_KEY}"
SectionEnd
`;
}

/**
 * Stops every process running from the install folder, and waits (up to 10 s) until they are gone. Through
 * WMI: the installer is a 32-bit program, so its PowerShell is too, and a 32-bit process cannot read a
 * 64-bit one's path (Get-Process's Path comes back empty).
 */
export const STOP_SCRIPT = `param([string]$Dir)
$prefix = [IO.Path]::GetFullPath($Dir).TrimEnd('\\') + '\\'
$running = { Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) } }
& $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
for ($i = 0; $i -lt 50 -and (& $running); $i++) { Start-Sleep -Milliseconds 200 }
`;

/** The longest path under `folder`, relative and with Windows separators. Links are not followed. */
export function deepestPath(folder: string): string {
  let deepest = "";
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${prefix}${entry.name}`;
      if (path.length > deepest.length) deepest = path;
      if (entry.isDirectory()) walk(join(dir, entry.name), `${path}\\`);
    }
  };
  walk(folder, "");
  return deepest;
}

/** How long `relative` gets on a typical PC while an update unpacks, the longest it ever is: root, app, staging, app. */
export function installedPathLength(appName: string, relative: string): number {
  return INSTALL_ROOT + appName.length + STAGING + appName.length + 1 + relative.length;
}

/** makensis: AKAN_NATIVE_MAKENSIS, PATH, then where the NSIS installer puts it. */
export function findMakensis(env: Record<string, string | undefined> = process.env): string | null {
  if (env.AKAN_NATIVE_MAKENSIS) return env.AKAN_NATIVE_MAKENSIS;
  const onPath = Bun.which("makensis");
  if (onPath) return onPath;
  for (const base of [env["ProgramFiles(x86)"], env.ProgramFiles]) {
    const candidate = base ? join(base, "NSIS", "makensis.exe") : null;
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/** The Evergreen Bootstrapper, downloaded once into the akan-native cache and checked. */
async function webview2Bootstrapper(): Promise<string> {
  const file = join(akanNativeHome(), "cache", "webview2", "MicrosoftEdgeWebview2Setup.exe");
  if (!existsSync(file)) {
    log.info(`downloading the WebView2 Evergreen Bootstrapper (${WEBVIEW2_BOOTSTRAPPER_URL})`);
    const response = await fetch(WEBVIEW2_BOOTSTRAPPER_URL, { redirect: "follow" });
    if (!response.ok) throw new CliError(`the WebView2 bootstrapper download answered ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 100_000 || bytes[0] !== 0x4d || bytes[1] !== 0x5a)
      throw new CliError("the WebView2 bootstrapper download is not a Windows program");
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, bytes);
  }
  if (process.platform === "win32") {
    const signer = await exec(
      [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$s = Get-AuthenticodeSignature -LiteralPath $env:AKAN_NATIVE_WEBVIEW2_SETUP; if ($s.Status -eq 'Valid') { $s.SignerCertificate.Subject }",
      ],
      { echo: false, env: { AKAN_NATIVE_WEBVIEW2_SETUP: file } },
    );
    if (!signer.stdout.includes("O=Microsoft Corporation"))
      throw new CliError(`${file} is not signed by Microsoft; delete it to download it again`);
  }
  return file;
}

/** Writes the setup program next to the app folder and answers its path. */
export async function buildWindowsInstaller(ctx: BuildContext, folder: string): Promise<string> {
  const makensis = findMakensis();
  if (!makensis)
    throw new ToolchainError(
      "NSIS (makensis) builds the installer: winget install NSIS.NSIS on Windows (or set AKAN_NATIVE_MAKENSIS)",
    );
  const { config } = ctx.project;
  const gen = join(ctx.outDir, "gen");
  mkdirSync(gen, { recursive: true });
  const stopScript = join(gen, "stop-app.ps1");
  writeFileSync(stopScript, STOP_SCRIPT);
  const icon = join(gen, "app.ico");
  const outFile = join(ctx.outDir, `${config.app.fileName}-${config.app.version}-${hostArch()}-setup.exe`);
  const script = join(gen, "installer.nsi");
  const deepest = deepestPath(folder);
  const longest = installedPathLength(config.app.name, deepest);
  if (longest > WINDOWS_MAX_PATH - 20)
    log.warn(
      `${deepest} reaches about ${longest} characters under %LOCALAPPDATA%\\Programs while an update unpacks: Windows refuses paths over ${WINDOWS_MAX_PATH} unless long paths are enabled, so the installer or an update fails on such a PC. Shorten app.name or that path.`,
    );
  writeFileSync(
    script,
    `﻿${installerScript({
      name: config.app.name,
      id: config.app.id,
      exe: `${config.app.fileName}.exe`,
      version: config.app.version,
      build: config.app.build,
      folder,
      entries: readdirSync(folder).map((name) => ({ name, dir: statSync(join(folder, name)).isDirectory() })),
      ...(existsSync(icon) ? { icon } : {}),
      bootstrapper: await webview2Bootstrapper(),
      stopScript,
      outFile,
    })}`,
  );
  log.step("installer: makensis");
  const result = await exec([makensis, "/V2", script], { echo: false });
  if (result.code !== 0 || !existsSync(outFile))
    throw new CliError(`makensis failed:\n${(result.stdout + result.stderr).trim().split("\n").slice(-20).join("\n")}`);
  log.info(`installer ${outFile} (${Math.round(readFileSync(outFile).length / 1024 / 1024)} MB)`);
  return outFile;
}

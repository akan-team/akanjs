// akan-native build windows --installer: an NSIS setup program around the app folder (CLI-9 installer).
//
// - Per user: %LOCALAPPDATA%\Programs\<name>, no administrator. The updates plugin swaps that folder by
//   renaming it and a sibling, which it could not do under Program Files without elevation.
// - `/S` installs silently (NSIS's own switch, what a remote update that runs setup.exe passes) and `/RUN`
//   starts the app after a silent install (an interactive one offers it on its last page); `/D=<dir>` picks
//   another folder, and without it a reinstall goes where the uninstall entry says the app is. A silent install
//   exits 2 when the new build did not take the folder's place, and 0 when it did.
// - WebView2: Windows 11 has it, and so does almost every Windows 10; LTSC editions do not. The installer
//   runs Microsoft's Evergreen Bootstrapper (embedded, 2 MB, it downloads the runtime) only when neither
//   the machine nor the user has one (docs: "Detect if a WebView2 Runtime is already installed").
// - One setup or uninstall of the app runs at a time: another one exits with 2 before it touches anything.
// - Whatever can fail without touching the installed app runs before it is stopped: free space, WebView2, the
//   new files, unpacked beside the folder (`<folder>.setup-new`), and the uninstaller
//   (`<folder>.setup-uninstall.exe`). The running copy is stopped by its path, so an unrelated program with the
//   same file name is left alone, and the folder is swapped by two renames; a failed swap puts the old folder
//   back, and with /RUN the app in place is started again.
// - The folder is the app's: updates replace it whole, so the uninstaller lives beside it
//   (`<folder>.uninstall.exe`) and a reinstall or an uninstall removes all of it, but never what a junction in
//   it points to. A `/D=` folder must be empty or hold the app already; without the app's executable in it only
//   the entries this build made are removed.
// - The shortcut and the started app work in %LOCALAPPDATA%, not the app folder: Windows cannot rename a
//   folder that is some process's working directory, which is what an update does.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../lib/exec.ts";
import { CliError, log, ToolchainError } from "../lib/log.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { akanNativeHome } from "../lib/toolchains.ts";
import { hostArch } from "../lib/updates.ts";
import { signWindowsFiles } from "../lib/windowssigning.ts";
import { windowsVersion } from "./windows.ts";

/** Microsoft's permanent link to the Evergreen Bootstrapper (MicrosoftEdgeWebview2Setup.exe). */
export const WEBVIEW2_BOOTSTRAPPER_URL = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
/** The WebView2 Runtime's EdgeUpdate client id; its `pv` value is the installed version. */
const WEBVIEW2_CLIENT = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
/** MAX_PATH less its NUL: what a PC without long paths enabled (the Windows default) can open or unpack. */
export const WINDOWS_MAX_PATH = 259;
/** `C:\Users\` + a 20-character user name + `\AppData\Local\Programs\`. */
const INSTALL_ROOT = "C:\\Users\\".length + 20 + "\\AppData\\Local\\Programs\\".length;
/** A release's bundle id is `<app.version>-<publish time in seconds>`, ten digits until the year 2286 (lib/publish.ts). */
const SEQUENCE_DIGITS = 10;
/** NTFS's default cluster: every file takes whole clusters on disk. */
const CLUSTER = 4096;
const MIB = 1024 * 1024;

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
  /** Bytes the app folder takes on disk, and bytes the setup unpacks in all (the folder and the WebView2 bootstrapper). */
  space: { install: number; unpack: number };
  /** deepLinks.schemes: the uninstaller removes those the app registered for its own executable. */
  schemes: string[];
  icon?: string;
  bootstrapper: string;
  stopScript: string;
  outFile: string;
  /** A command that signs the uninstaller makensis writes into the setup program, `%1` its path. */
  signUninstaller?: string;
}

/** `$` is NSIS's variable sigil; the names that reach a script cannot hold a quote (config.ts app.name). */
const nsis = (value: string) => value.replace(/\$/g, "$$$$");

const mib = (bytes: number) => Math.ceil(bytes / MIB);

const removal = (entries: InstallerInput["entries"]) =>
  entries
    .map(({ name, dir }) =>
      dir ? `  !insertmacro RemoveTree "$INSTDIR\\${nsis(name)}"` : `  Delete "$INSTDIR\\${nsis(name)}"`,
    )
    .join("\n");

const moveIn = (entries: InstallerInput["entries"]) =>
  entries.map(({ name }) => `      Rename "$INSTDIR.setup-new\\${nsis(name)}" "$INSTDIR\\${nsis(name)}"`).join("\n");

const unlink = (schemes: string[]) =>
  schemes
    .map(
      (scheme) => `  ReadRegStr $0 HKCU "Software\\Classes\\${scheme}\\shell\\open\\command" ""
  \${If} $0 == '"$INSTDIR\\\${EXE}" "%1"'
    DeleteRegKey HKCU "Software\\Classes\\${scheme}"
  \${EndIf}
`,
    )
    .join("");

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
!define APP_ID "${nsis(input.id)}"
!define UNINSTALL_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${input.id}"
!define RUN_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Run"
!define STARTUP_APPROVED_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"
!define RUN_ONCE_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce"
!define AUMID_KEY "Software\\Classes\\AppUserModelId\\${input.id}"
!define WEBVIEW2_KEY "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT}"
!define APP_MB ${mib(input.space.install)}
!define UNPACK_MB ${mib(input.space.unpack)}

Name "\${APP_NAME}"
OutFile "${nsis(input.outFile)}"
${input.signUninstaller ? `!uninstfinalize '${input.signUninstaller}' = 0\n` : ""}
InstallDir "$LOCALAPPDATA\\Programs\\\${APP_NAME}"
InstallDirRegKey HKCU "\${UNINSTALL_KEY}" "InstallLocation"
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

Var AppStopped
Var RunAfter

Function RunApp
  \${If} \${FileExists} "$INSTDIR\\\${EXE}"
    SetOutPath "$LOCALAPPDATA"
    Exec '"$INSTDIR\\\${EXE}"'
  \${EndIf}
FunctionEnd

!macro Fail MESSAGE
  DetailPrint "\${MESSAGE}"
  \${IfNot} \${Silent}
    MessageBox MB_ICONSTOP|MB_OK "\${MESSAGE}"
  \${EndIf}
  \${If} $AppStopped == 1
  \${AndIf} $RunAfter == 1
    Call RunApp
  \${EndIf}
  SetErrorLevel 2
  Abort
!macroend

!macro Warn MESSAGE
  DetailPrint "\${MESSAGE}"
  \${IfNot} \${Silent}
    MessageBox MB_ICONEXCLAMATION|MB_OK "\${MESSAGE}"
  \${EndIf}
!macroend

; Local\\, not Global\\: another user's setup installs into that user's own folder.
!macro OnlyOneSetup
  System::Call 'kernel32::CreateMutex(p 0, i 0, t "Local\\akan-native-setup-\${APP_ID}") p .r0 ?e'
  Pop $1
  \${If} $0 = 0
  \${OrIf} $1 = 183
    \${IfNot} \${Silent}
      MessageBox MB_ICONSTOP|MB_OK "Another setup or uninstall of \${APP_NAME} is running."
    \${EndIf}
    SetErrorLevel 2
    Abort
  \${EndIf}
!macroend

; RMDir /r walks into a junction and empties its target; rd /s (Vista and later) removes the link itself.
; The path reaches cmd through the environment, so % ^ & in it stay literal. rd answers 0 even when a file stays.
!macro RemoveTree PATH
  StrCpy $R9 "\${PATH}"
  System::Call 'kernel32::SetEnvironmentVariable(t "AKAN_NATIVE_REMOVE", t R9)'
  nsExec::Exec '"$SYSDIR\\cmd.exe" /d /c rmdir /s /q "%AKAN_NATIVE_REMOVE%"'
  Pop $R9
!macroend

!macro RemoveLeftover PATH
  !insertmacro RemoveTree "\${PATH}"
  \${If} \${FileExists} "\${PATH}"
    !insertmacro Fail "\${PATH}, left by an earlier setup, could not be removed. \${APP_NAME} is left as it was."
  \${EndIf}
!macroend

!macro RemoveEntries
${removal(input.entries)}
!macroend

!macro RemoveApp
  \${If} \${FileExists} "$INSTDIR\\\${EXE}"
    !insertmacro RemoveTree "$INSTDIR"
  \${Else}
    !insertmacro RemoveEntries
  \${EndIf}
!macroend

; Windows refuses to rename a folder while a file in it is open: a stopped process's handles, and an antivirus
; scan of files just written, close a moment later. $R2 is "done" once the rename went through.
!macro RenameRetry FROM TO
  StrCpy $R2 0
  \${Do}
    ClearErrors
    Rename "\${FROM}" "\${TO}"
    \${IfNot} \${Errors}
      StrCpy $R2 "done"
      \${ExitDo}
    \${EndIf}
    IntOp $R2 $R2 + 1
    Sleep 250
  \${LoopWhile} $R2 < 40
!macroend

!macro RemoveSiblings SUFFIX
  FindFirst $R0 $R1 "$INSTDIR.\${SUFFIX}*"
  \${DoWhile} $R1 != ""
    \${If} \${FileExists} "$INSTDIR\\..\\$R1\\*.*"
      !insertmacro RemoveTree "$INSTDIR\\..\\$R1"
    \${Else}
      Delete "$INSTDIR\\..\\$R1"
    \${EndIf}
    FindNext $R0 $R1
  \${Loop}
  FindClose $R0
!macroend

!macro CheckStaged
  \${IfNot} \${FileExists} "$INSTDIR.setup-new\\\${EXE}"
  \${OrIfNot} \${FileExists} "$INSTDIR.setup-new\\resources\\boot.json"
    !insertmacro Fail "The files unpacked into $INSTDIR.setup-new are incomplete: another program removed some, or an antivirus took one. \${APP_NAME} is left as it was."
  \${EndIf}
!macroend

Function .onInit
  !insertmacro OnlyOneSetup
FunctionEnd

; A full disk ends the section inside File; a file that cannot be created only sets the error flag.
Function .onInstFailed
  SetOutPath "$LOCALAPPDATA"
  !insertmacro RemoveTree "$INSTDIR.setup-new"
  Delete "$INSTDIR.setup-uninstall.exe"
FunctionEnd

; /SOLID first unpacks what the setup carries into a file in $TEMP, which grows to all of it.
Function CheckSpace
  \${GetRoot} "$INSTDIR" $R0
  \${GetRoot} "$TEMP" $R1
  StrCpy $R2 \${APP_MB}
  StrCpy $R3 \${UNPACK_MB}
  \${If} $R0 == $R1
    IntOp $R2 $R2 + $R3
    StrCpy $R3 0
  \${EndIf}
  ClearErrors
  \${DriveSpace} "$R0\\" "/D=F /S=M" $R4
  \${IfNot} \${Errors}
    \${If} $R4 < $R2
      !insertmacro Fail "$R0 has $R4 MB free, and the setup needs $R2 MB there. \${APP_NAME} is left as it was."
    \${EndIf}
  \${EndIf}
  \${If} $R3 > 0
    ClearErrors
    \${DriveSpace} "$R1\\" "/D=F /S=M" $R4
    \${IfNot} \${Errors}
      \${If} $R4 < $R3
        !insertmacro Fail "$R1 has $R4 MB free, and the setup needs $R3 MB there to unpack in $TEMP. \${APP_NAME} is left as it was."
      \${EndIf}
    \${EndIf}
  \${EndIf}
FunctionEnd

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
  \${If} \${Silent}
    \${GetParameters} $0
    ClearErrors
    \${GetOptions} $0 "/RUN" $1
    \${IfNot} \${Errors}
      StrCpy $RunAfter 1
    \${EndIf}
  \${EndIf}
  ; A setup cut off between its two renames left the app only in .setup-old.
  \${DirState} "$INSTDIR" $0
  \${If} $0 == -1
  \${AndIf} \${FileExists} "$INSTDIR.setup-old\\\${EXE}"
    Rename "$INSTDIR.setup-old" "$INSTDIR"
  \${EndIf}
  !insertmacro RemoveLeftover "$INSTDIR.setup-new"
  \${If} \${FileExists} "$INSTDIR\\\${EXE}"
  \${OrIfNot} \${FileExists} "$INSTDIR.setup-old\\\${EXE}"
    !insertmacro RemoveLeftover "$INSTDIR.setup-old"
  \${EndIf}
  Delete "$INSTDIR.setup-uninstall.exe"
  \${DirState} "$INSTDIR" $0
  \${If} $0 == 1
  \${AndIfNot} \${FileExists} "$INSTDIR\\\${EXE}"
  \${AndIf} "$INSTDIR" != "$LOCALAPPDATA\\Programs\\\${APP_NAME}"
    !insertmacro Fail "$INSTDIR holds other files. Install into an empty folder, or where \${APP_NAME} is installed."
  \${EndIf}
  Call CheckSpace
  InitPluginsDir
  Call EnsureWebView2
  SetOutPath "$INSTDIR.setup-new"
  ClearErrors
  File /r "${nsis(input.folder)}\\*"
  \${If} \${Errors}
    !insertmacro Fail "Some files could not be written to $INSTDIR.setup-new: the disk is full, this user may not write there, an antivirus holds a file, or a path is over 260 characters and long paths are not enabled."
  \${EndIf}
  ; SetOutPath is also the installer's working folder, which Windows does not let anyone rename.
  SetOutPath "$LOCALAPPDATA"
  !insertmacro CheckStaged
  ClearErrors
  WriteUninstaller "$INSTDIR.setup-uninstall.exe"
  \${If} \${Errors}
    !insertmacro Fail "The uninstaller could not be written to $INSTDIR.setup-uninstall.exe. \${APP_NAME} is left as it was."
  \${EndIf}
  File "/oname=$PLUGINSDIR\\stop-app.ps1" "${nsis(input.stopScript)}"
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\stop-app.ps1" "$INSTDIR"'
  Pop $0
  \${If} $0 == 0
    StrCpy $AppStopped 1
  \${EndIf}
  !insertmacro CheckStaged
  \${If} \${FileExists} "$INSTDIR\\\${EXE}"
    !insertmacro RenameRetry "$INSTDIR" "$INSTDIR.setup-old"
    \${If} $R2 != "done"
      !insertmacro Fail "$INSTDIR is in use and could not be replaced; \${APP_NAME} is left as it was."
    \${EndIf}
    !insertmacro RenameRetry "$INSTDIR.setup-new" "$INSTDIR"
    \${If} $R2 != "done"
      !insertmacro RenameRetry "$INSTDIR.setup-old" "$INSTDIR"
      \${If} $R2 != "done"
        !insertmacro Fail "Neither the new files nor the old ones could be moved back to $INSTDIR: \${APP_NAME} is in $INSTDIR.setup-old, which the next setup puts back."
      \${EndIf}
      !insertmacro Fail "The new files could not take the place of $INSTDIR; \${APP_NAME} is left as it was."
    \${EndIf}
    !insertmacro RemoveTree "$INSTDIR.setup-old"
  \${Else}
    !insertmacro RemoveEntries
    RMDir "$INSTDIR"
    \${DirState} "$INSTDIR" $0
    \${If} $0 == 1
      ClearErrors
${moveIn(input.entries)}
      \${If} \${Errors}
        !insertmacro Fail "Some files could not be moved into $INSTDIR."
      \${EndIf}
      !insertmacro RemoveTree "$INSTDIR.setup-new"
    \${Else}
      !insertmacro RenameRetry "$INSTDIR.setup-new" "$INSTDIR"
      \${If} $R2 != "done"
        !insertmacro Fail "$INSTDIR could not be made."
      \${EndIf}
    \${EndIf}
  \${EndIf}
  ClearErrors
  StrCpy $R0 "$INSTDIR.setup-uninstall.exe"
  StrCpy $R1 "$INSTDIR.uninstall.exe"
  System::Call 'kernel32::MoveFileEx(t R0, t R1, i 1) i .r0'
  \${If} $0 = 0
    SetErrors
  \${EndIf}
  CreateShortcut "$SMPROGRAMS\\\${APP_NAME}.lnk" "$INSTDIR\\\${EXE}"
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "DisplayName" "\${APP_NAME}"
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "DisplayVersion" "${nsis(input.version)}"
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\\\${EXE}"
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR.uninstall.exe"'
  WriteRegStr HKCU "\${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR.uninstall.exe" /S'
  WriteRegDWORD HKCU "\${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "\${UNINSTALL_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "\${UNINSTALL_KEY}" "EstimatedSize" ${Math.ceil(input.space.install / 1024)}
  \${If} \${Errors}
    !insertmacro Warn "\${APP_NAME} is installed, but its uninstaller, Start menu shortcut or uninstall entry could not all be written."
  \${EndIf}
  \${If} $RunAfter == 1
    Call RunApp
  \${EndIf}
SectionEnd

Function un.onInit
  !insertmacro OnlyOneSetup
  ReadRegStr $INSTDIR HKCU "\${UNINSTALL_KEY}" "InstallLocation"
  \${GetRoot} "$INSTDIR" $0
  \${If} $0 == ""
  \${OrIf} $INSTDIR == $0
  \${OrIf} $INSTDIR == "$0\\"
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
  !insertmacro RemoveTree "$INSTDIR.previous"
  !insertmacro RemoveSiblings "update-"
  !insertmacro RemoveSiblings "failed-"
  !insertmacro RemoveSiblings "setup-"
  !insertmacro RemoveApp
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "\${UNINSTALL_KEY}"
  DeleteRegValue HKCU "\${RUN_KEY}" "\${APP_ID}"
  DeleteRegValue HKCU "\${STARTUP_APPROVED_KEY}" "\${APP_ID}"
  DeleteRegValue HKCU "\${RUN_ONCE_KEY}" "akan-native-update \${APP_ID}"
${unlink(input.schemes)}  DeleteRegKey HKCU "\${AUMID_KEY}"
  Delete "$LOCALAPPDATA\\\${APP_ID}\\notification-icon.png"
  !insertmacro RemoveTree "$LOCALAPPDATA\\\${APP_ID}\\akan-native-updates"
  !insertmacro RemoveTree "$LOCALAPPDATA\\\${APP_ID}\\akan-native-updates-debug"
  Delete "$LOCALAPPDATA\\\${APP_ID}\\akan-native-relaunch.json"
  RMDir "$LOCALAPPDATA\\\${APP_ID}"
  ; Last: the uninstaller runs as a copy in $TEMP and the one started exits at once, so its file going marks the end.
  Delete "$INSTDIR.uninstall.exe"
SectionEnd
`;
}

/**
 * Stops every process running from the install folder, waits (up to 10 s) until they are gone, and exits 1 when
 * one is left or cannot be seen. Through WMI: the installer is a 32-bit program, so its PowerShell is too, and a
 * 32-bit process cannot read a 64-bit one's path (Get-Process's Path comes back empty).
 */
export const STOP_SCRIPT = `param([string]$Dir)
$ErrorActionPreference = 'Stop'
$prefix = [IO.Path]::GetFullPath($Dir).TrimEnd('\\') + '\\'
$running = { Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) } }
& $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
for ($i = 0; $i -lt 50 -and (& $running); $i++) { Start-Sleep -Milliseconds 200 }
if (& $running) { exit 1 }
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

/** The bytes of the files under `folder`, and what they take on disk. Links are not followed. */
export function folderSize(folder: string): { bytes: number; disk: number } {
  let bytes = 0;
  let disk = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        const { size } = statSync(path);
        bytes += size;
        disk += Math.ceil(size / CLUSTER) * CLUSTER;
      }
    }
  };
  walk(folder);
  return { bytes, disk };
}

/**
 * How long `relative` gets on a typical PC while an update unpacks, the longest it ever is: root, app, then
 * `.update-<bundle>\` and the app again.
 */
export function installedPathLength(appName: string, version: string, relative: string): number {
  const staging = ".update-".length + version.length + 1 + SEQUENCE_DIGITS + 1;
  return INSTALL_ROOT + appName.length + staging + appName.length + 1 + relative.length;
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

const SIGNING_ENV = "AKAN_NATIVE_WINDOWS_SIGNING";

/** The command `!uninstfinalize` runs on the uninstaller: this Bun on a script that signs it as the app was signed. */
function uninstallerSigner(gen: string, description: string): string {
  const script = join(gen, "sign-uninstaller.ts");
  writeFileSync(
    script,
    `// Generated by akan-native build. Do not edit.
import { signWindowsFiles } from ${JSON.stringify(join(import.meta.dir, "..", "lib", "windowssigning.ts"))};

await signWindowsFiles(JSON.parse(process.env.${SIGNING_ENV} ?? "{}"), [process.argv[2] ?? ""], ${JSON.stringify(description)});
`,
  );
  return `"${process.execPath}" "${script}" "%1"`;
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
  const outFile = join(ctx.outDir, `${config.app.fileName}-${config.app.version}-${ctx.arch ?? hostArch()}-setup.exe`);
  const script = join(gen, "installer.nsi");
  const deepest = deepestPath(folder);
  const longest = installedPathLength(config.app.name, config.app.version, deepest);
  if (longest > WINDOWS_MAX_PATH - 20)
    log.warn(
      `${deepest} reaches about ${longest} characters under %LOCALAPPDATA%\\Programs while an update unpacks: Windows refuses paths over ${WINDOWS_MAX_PATH} unless long paths are enabled, so the installer or an update fails on such a PC. Shorten app.name or that path.`,
    );
  const bootstrapper = await webview2Bootstrapper();
  const size = folderSize(folder);
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
      space: { install: size.disk, unpack: size.bytes + statSync(bootstrapper).size },
      schemes: config.deepLinks.schemes,
      ...(existsSync(icon) ? { icon } : {}),
      bootstrapper,
      stopScript,
      outFile,
      ...(ctx.windows?.signing ? { signUninstaller: uninstallerSigner(gen, `${config.app.name} Uninstall`) } : {}),
    })}`,
  );
  log.step("installer: makensis");
  const signing = ctx.windows?.signing;
  const result = await exec([makensis, "/V2", script], {
    echo: false,
    //? The signer reads its settings here, so a .pfx password reaches no file and no makensis argument.
    ...(signing ? { env: { [SIGNING_ENV]: JSON.stringify(signing) } } : {}),
  });
  if (result.code !== 0 || !existsSync(outFile))
    throw new CliError(`makensis failed:\n${(result.stdout + result.stderr).trim().split("\n").slice(-20).join("\n")}`);
  if (signing) await signWindowsFiles(signing, [outFile], `${config.app.name} Setup`);
  log.info(`installer ${outFile} (${Math.round(readFileSync(outFile).length / 1024 / 1024)} MB)`);
  return outFile;
}

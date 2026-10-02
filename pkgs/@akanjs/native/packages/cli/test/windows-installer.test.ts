// biome-ignore-all lint/suspicious/noTemplateCurlyInString: an NSIS script spells its defines and macros ${NAME}
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deepestPath,
  findMakensis,
  folderSize,
  installedPathLength,
  installerScript,
  STOP_SCRIPT,
  WINDOWS_MAX_PATH,
} from "../src/platforms/windows-installer.ts";

const MIB = 1024 * 1024;

const input = {
  name: "Board $ign",
  id: "com.example.board",
  exe: "board.exe",
  version: "1.2.0",
  build: 7,
  folder: "C:\\build\\Board $ign",
  entries: [
    { name: "board.exe", dir: false },
    { name: "akan_native_desktop.dll", dir: false },
    { name: "resources", dir: true },
  ],
  space: { install: 150 * MIB + 1, unpack: 160 * MIB },
  schemes: ["board", "board-dev"],
  icon: "C:\\build\\gen\\app.ico",
  bootstrapper: "C:\\cache\\MicrosoftEdgeWebview2Setup.exe",
  stopScript: "C:\\build\\gen\\stop-app.ps1",
  outFile: "C:\\build\\board-1.2.0-x64-setup.exe",
};

describe("the Windows installer script", () => {
  const script = installerScript(input);
  const section = (from: string, to: string) => {
    const start = script.indexOf(from);
    return script.slice(start, script.indexOf(to, start));
  };
  const install = section('Section "Install"', "SectionEnd");
  const uninstall = section('Section "Uninstall"', "SectionEnd");
  const afterSwap = install.slice(install.indexOf('StrCpy $R0 "$INSTDIR.setup-uninstall.exe"'));

  test("installs for the user, where the updates plugin can swap the folder, and again where the app is", () => {
    expect(script).toContain("RequestExecutionLevel user");
    expect(script).toContain('InstallDir "$LOCALAPPDATA\\Programs\\${APP_NAME}"');
    expect(script).toContain('InstallDirRegKey HKCU "${UNINSTALL_KEY}" "InstallLocation"');
    expect(script).toContain('!define APP_NAME "Board $$ign"');
    expect(script).toContain('VIProductVersion "1.2.0.7"');
    expect(script).toContain(
      '!define UNINSTALL_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.example.board"',
    );
  });

  test("runs one setup or uninstall at a time, and a second one exits 2 before it touches anything", () => {
    const lock = section("!macro OnlyOneSetup", "; RMDir /r");
    expect(lock).toContain(
      `System::Call 'kernel32::CreateMutex(p 0, i 0, t "Local\\akan-native-setup-\${APP_ID}") p .r0 ?e'`,
    );
    expect(lock).toContain("${If} $0 = 0\n  ${OrIf} $1 = 183");
    expect(lock).toContain("SetErrorLevel 2\n    Abort");
    expect(section("Function .onInit", "FunctionEnd")).toContain("!insertmacro OnlyOneSetup");
    expect(section("Function un.onInit", "FunctionEnd")).toContain(
      '!insertmacro OnlyOneSetup\n  ReadRegStr $INSTDIR HKCU "${UNINSTALL_KEY}" "InstallLocation"',
    );
  });

  test("never walks into a junction when it removes a folder", () => {
    expect(script).not.toMatch(/^\s*RMDir \/r/m);
    expect(section("!macro RemoveTree", "!macroend")).toContain(
      `System::Call 'kernel32::SetEnvironmentVariable(t "AKAN_NATIVE_REMOVE", t R9)'\n  nsExec::Exec '"$SYSDIR\\cmd.exe" /d /c rmdir /s /q "%AKAN_NATIVE_REMOVE%"'`,
    );
    const removeApp = section("!macro RemoveApp", "!macro RenameRetry");
    expect(removeApp).toContain(
      '${If} ${FileExists} "$INSTDIR\\${EXE}"\n    !insertmacro RemoveTree "$INSTDIR"\n  ${Else}',
    );
    expect(section("!macro RemoveSiblings", "!macro CheckStaged")).toContain(
      '${If} ${FileExists} "$INSTDIR\\..\\$R1\\*.*"\n      !insertmacro RemoveTree "$INSTDIR\\..\\$R1"\n    ${Else}\n      Delete "$INSTDIR\\..\\$R1"',
    );
  });

  test("keeps the uninstaller beside the folder an update replaces, and finds that folder from the entry", () => {
    expect(script).not.toContain('WriteUninstaller "$INSTDIR.uninstall.exe"');
    expect(install).toContain('WriteUninstaller "$INSTDIR.setup-uninstall.exe"');
    expect(afterSwap).toContain(
      `StrCpy $R1 "$INSTDIR.uninstall.exe"\n  System::Call 'kernel32::MoveFileEx(t R0, t R1, i 1) i .r0'`,
    );
    expect(script).toContain(`"UninstallString" '"$INSTDIR.uninstall.exe"'`);
    expect(script).toContain(`"QuietUninstallString" '"$INSTDIR.uninstall.exe" /S'`);
    expect(script).not.toContain("$INSTDIR\\uninstall.exe");
    expect(uninstall.trimEnd().split("\n").at(-1)).toBe('  Delete "$INSTDIR.uninstall.exe"');
    expect(uninstall.match(/\$INSTDIR\.uninstall\.exe/g)).toHaveLength(1);
  });

  test("removes the whole folder only when the app is in it, else only what the build made", () => {
    expect(section("!macro RemoveApp", "!macro RenameRetry")).toContain("!insertmacro RemoveEntries");
    const entries = section("!macro RemoveEntries", "!macro RemoveApp");
    expect(entries).toContain('Delete "$INSTDIR\\board.exe"');
    expect(entries).toContain('!insertmacro RemoveTree "$INSTDIR\\resources"');
    expect(script.match(/!insertmacro RemoveApp/g)).toHaveLength(1);
    expect(script.match(/File \/r "/g)).toHaveLength(1);
  });

  test("refuses a /D= folder that holds someone else's files", () => {
    const start = section('Section "Install"', "InitPluginsDir");
    expect(start).toContain('${DirState} "$INSTDIR" $0');
    expect(start).toContain('${AndIfNot} ${FileExists} "$INSTDIR\\${EXE}"');
    expect(start).toContain('${AndIf} "$INSTDIR" != "$LOCALAPPDATA\\Programs\\${APP_NAME}"');
    expect(start).toContain("!insertmacro Fail");
  });

  test("the uninstaller refuses an entry that names no folder, or a drive root", () => {
    expect(section("Function un.onInit", "FunctionEnd")).toContain(
      '${GetRoot} "$INSTDIR" $0\n  ${If} $0 == ""\n  ${OrIf} $INSTDIR == $0\n  ${OrIf} $INSTDIR == "$0\\"',
    );
  });

  test("uninstalls what updates and setups left next to the folder", () => {
    expect(uninstall).toContain('!insertmacro RemoveTree "$INSTDIR.previous"');
    expect(uninstall).toContain('!insertmacro RemoveSiblings "update-"');
    expect(uninstall).toContain('!insertmacro RemoveSiblings "failed-"');
    expect(uninstall).toContain('!insertmacro RemoveSiblings "setup-"');
    expect(uninstall).toContain("!insertmacro RemoveApp");
    expect(script).toContain('FindFirst $R0 $R1 "$INSTDIR.${SUFFIX}*"');
  });

  test("uninstalls the launch at login and the shell's update state, and keeps the user's data", () => {
    expect(script).toContain('!define APP_ID "com.example.board"');
    expect(uninstall).toContain('DeleteRegValue HKCU "${RUN_KEY}" "${APP_ID}"');
    expect(uninstall).toContain('DeleteRegValue HKCU "${STARTUP_APPROVED_KEY}" "${APP_ID}"');
    expect(script).toContain('!define RUN_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Run"');
    expect(uninstall).toContain('!insertmacro RemoveTree "$LOCALAPPDATA\\${APP_ID}\\akan-native-updates"');
    expect(uninstall).toContain('!insertmacro RemoveTree "$LOCALAPPDATA\\${APP_ID}\\akan-native-updates-debug"');
    expect(script).toContain('!define RUN_ONCE_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce"');
    expect(uninstall).toContain('DeleteRegValue HKCU "${RUN_ONCE_KEY}" "akan-native-update ${APP_ID}"');
    expect(uninstall).toContain('RMDir "$LOCALAPPDATA\\${APP_ID}"');
    expect(uninstall).not.toContain('RemoveTree "$LOCALAPPDATA\\${APP_ID}"\n');
  });

  test("uninstalls the deep link schemes that still open this app, and its notification registration", () => {
    for (const scheme of input.schemes) {
      expect(uninstall).toContain(
        `ReadRegStr $0 HKCU "Software\\Classes\\${scheme}\\shell\\open\\command" ""\n  \${If} $0 == '"$INSTDIR\\\${EXE}" "%1"'\n    DeleteRegKey HKCU "Software\\Classes\\${scheme}"\n  \${EndIf}`,
      );
    }
    expect(script).toContain('!define AUMID_KEY "Software\\Classes\\AppUserModelId\\com.example.board"');
    expect(uninstall).toContain('DeleteRegKey HKCU "${AUMID_KEY}"');
    expect(uninstall).toContain('Delete "$LOCALAPPDATA\\${APP_ID}\\notification-icon.png"');
    const plain = installerScript({ ...input, schemes: [] });
    expect(plain).not.toContain("shell\\open\\command");
    expect(plain).toContain('"akan-native-update ${APP_ID}"\n  DeleteRegKey HKCU "${AUMID_KEY}"');
  });

  test("signs the uninstaller it writes only when the build signs, before makensis checks the result", () => {
    expect(script).not.toContain("!uninstfinalize");
    const signed = installerScript({ ...input, signUninstaller: '"bun" "sign.ts" "%1"' });
    expect(signed).toContain(`!uninstfinalize '"bun" "sign.ts" "%1"' = 0`);
  });

  test("starts the app and the shortcut outside the folder an update renames", () => {
    const outside = install.indexOf('  SetOutPath "$LOCALAPPDATA"\n  !insertmacro CheckStaged');
    expect(outside).toBeGreaterThan(install.indexOf('File /r "'));
    expect(outside).toBeLessThan(install.indexOf('stop-app.ps1" "$INSTDIR"'));
    expect(outside).toBeLessThan(install.indexOf("RenameRetry"));
    expect(outside).toBeLessThan(install.indexOf("CreateShortcut"));
    expect(section("Function RunApp", "FunctionEnd")).toContain(
      `SetOutPath "$LOCALAPPDATA"\n    Exec '"$INSTDIR\\\${EXE}"'`,
    );
  });

  test("runs the app on /RUN only after a silent install: the last page offers it otherwise", () => {
    expect(script).toContain('!define MUI_FINISHPAGE_RUN "$INSTDIR\\${EXE}"');
    expect(script).toContain(
      '${If} ${Silent}\n    ${GetParameters} $0\n    ClearErrors\n    ${GetOptions} $0 "/RUN" $1\n    ${IfNot} ${Errors}\n      StrCpy $RunAfter 1',
    );
    expect(script).toContain("${If} $RunAfter == 1\n    Call RunApp\n  ${EndIf}\nSectionEnd");
    expect(script.match(/Exec '"\$INSTDIR/g)).toHaveLength(1);
  });

  test("checks, unpacks and writes the uninstaller before it stops the app, and swaps the folder by renames", () => {
    const stop = install.indexOf('stop-app.ps1" "$INSTDIR"');
    for (const before of [
      '!insertmacro RemoveLeftover "$INSTDIR.setup-new"',
      "Call CheckSpace",
      "Call EnsureWebView2",
      'File /r "',
      "!insertmacro CheckStaged",
      'WriteUninstaller "$INSTDIR.setup-uninstall.exe"',
    ]) {
      expect(install.indexOf(before)).toBeGreaterThan(-1);
      expect(install.indexOf(before)).toBeLessThan(stop);
    }
    expect(install.indexOf("Call CheckSpace")).toBeLessThan(install.indexOf('SetOutPath "$INSTDIR.setup-new"'));
    expect(install.indexOf('SetOutPath "$INSTDIR.setup-new"')).toBeLessThan(install.indexOf('File /r "'));
    const swap = install.slice(install.indexOf('!insertmacro RenameRetry "$INSTDIR" "$INSTDIR.setup-old"'));
    expect(install.slice(stop, install.indexOf("RenameRetry"))).toContain("!insertmacro CheckStaged");
    expect(swap).toContain('!insertmacro RenameRetry "$INSTDIR.setup-new" "$INSTDIR"');
    expect(swap).toContain(
      '${If} $R2 != "done"\n      !insertmacro RenameRetry "$INSTDIR.setup-old" "$INSTDIR"\n      ${If} $R2 != "done"\n        !insertmacro Fail',
    );
    expect(swap).toContain('!insertmacro RemoveTree "$INSTDIR.setup-old"');
    expect(install).not.toContain('SetOutPath "$INSTDIR"');
  });

  test("swaps in only an unpacked app that has its executable and boot.json", () => {
    const staged = section("!macro CheckStaged", "!macroend");
    expect(staged).toContain('${IfNot} ${FileExists} "$INSTDIR.setup-new\\${EXE}"');
    expect(staged).toContain('${OrIfNot} ${FileExists} "$INSTDIR.setup-new\\resources\\boot.json"');
    expect(staged).toContain("!insertmacro Fail");
    expect(install.match(/!insertmacro CheckStaged/g)).toHaveLength(2);
  });

  test("moves the new entries into a folder that holds other files, and keeps a setup's only copy of the app", () => {
    expect(install).toContain('Rename "$INSTDIR.setup-new\\board.exe" "$INSTDIR\\board.exe"');
    expect(install).toContain('Rename "$INSTDIR.setup-new\\resources" "$INSTDIR\\resources"');
    expect(install).toContain(
      '${If} $0 == -1\n  ${AndIf} ${FileExists} "$INSTDIR.setup-old\\${EXE}"\n    Rename "$INSTDIR.setup-old" "$INSTDIR"',
    );
    expect(install).toContain(
      '${If} ${FileExists} "$INSTDIR\\${EXE}"\n  ${OrIfNot} ${FileExists} "$INSTDIR.setup-old\\${EXE}"\n    !insertmacro RemoveLeftover "$INSTDIR.setup-old"',
    );
  });

  test("fails before anything changes when an earlier setup's leftovers cannot be removed", () => {
    const leftover = section("!macro RemoveLeftover", "!macro RemoveEntries");
    expect(leftover).toContain(
      '!insertmacro RemoveTree "${PATH}"\n  ${If} ${FileExists} "${PATH}"\n    !insertmacro Fail',
    );
    expect(install.indexOf('!insertmacro RemoveLeftover "$INSTDIR.setup-new"')).toBeLessThan(
      install.indexOf("Call CheckSpace"),
    );
    expect(install).toContain('Delete "$INSTDIR.setup-uninstall.exe"');
  });

  test("refuses to start without room for the new files and for its own unpacking in TEMP", () => {
    expect(script).toContain("!define APP_MB 151\n!define UNPACK_MB 160");
    const space = section("Function CheckSpace", "FunctionEnd");
    expect(space).toContain('${GetRoot} "$INSTDIR" $R0\n  ${GetRoot} "$TEMP" $R1');
    expect(space).toContain("${If} $R0 == $R1\n    IntOp $R2 $R2 + $R3\n    StrCpy $R3 0");
    expect(space).toContain('${DriveSpace} "$R0\\" "/D=F /S=M" $R4');
    expect(space).toContain('${DriveSpace} "$R1\\" "/D=F /S=M" $R4');
    expect(space.match(/\$\{If\} \$R4 < \$R[23]\n\s+!insertmacro Fail/g)).toHaveLength(2);
    expect(script).toContain('"EstimatedSize" 153601');
  });

  test("a failed install removes what it unpacked, even when a full disk ended it inside File", () => {
    const failed = section("Function .onInstFailed", "FunctionEnd");
    expect(failed).toContain(
      'SetOutPath "$LOCALAPPDATA"\n  !insertmacro RemoveTree "$INSTDIR.setup-new"\n  Delete "$INSTDIR.setup-uninstall.exe"',
    );
    expect(install).toContain(
      'ClearErrors\n  File /r "C:\\build\\Board $$ign\\*"\n  ${If} ${Errors}\n    !insertmacro Fail "Some files could not be written to $INSTDIR.setup-new:',
    );
    expect(install).not.toContain("Windows refuses a path over 260 characters");
  });

  test("once the new build is in place, a missing uninstaller, shortcut or entry is a warning, not a failure", () => {
    expect(afterSwap).not.toContain("!insertmacro Fail");
    expect(afterSwap).toContain("${If} $0 = 0\n    SetErrors\n  ${EndIf}\n  CreateShortcut");
    expect(afterSwap).toContain('${If} ${Errors}\n    !insertmacro Warn "${APP_NAME} is installed, but');
    expect(afterSwap.indexOf("!insertmacro Warn")).toBeGreaterThan(afterSwap.lastIndexOf("WriteReg"));
    expect(section("!macro Warn", "!macroend")).not.toContain("Abort");
  });

  test("a failure after the app was stopped starts the app in place again on /RUN, if the stop worked", () => {
    const fail = section("!macro Fail", "!macroend");
    expect(fail).toContain("${If} $AppStopped == 1\n  ${AndIf} $RunAfter == 1\n    Call RunApp");
    expect(section("Function RunApp", "FunctionEnd")).toContain('${If} ${FileExists} "$INSTDIR\\${EXE}"');
    expect(install).toContain("Pop $0\n  ${If} $0 == 0\n    StrCpy $AppStopped 1\n  ${EndIf}");
  });

  test("a silent install that could not finish exits non-zero", () => {
    expect(script).toContain("ManifestLongPathAware true");
    expect(section("!macro Fail", "!macroend")).toContain("SetErrorLevel 2\n  Abort");
    const webview2 = section("Function EnsureWebView2", 'Section "Install"');
    expect(webview2.match(/Call WebView2Version/g)).toHaveLength(2);
    expect(webview2).toContain("${If} ${Silent}\n    !insertmacro Fail");
    expect(webview2).toContain("MB_OKCANCEL");
  });

  test("stops a running copy by its path and installs WebView2 only when missing", () => {
    expect(script.match(/stop-app\.ps1" "\$INSTDIR"/g)).toHaveLength(2);
    expect(script).toContain("{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}");
    expect(script).toContain(`ExecWait '"$PLUGINSDIR\\MicrosoftEdgeWebview2Setup.exe" /silent /install' $1`);
    expect(script).toContain('!define MUI_ICON "C:\\build\\gen\\app.ico"');
  });

  test("the stop script answers 1 when a copy is still running or the processes cannot be listed", () => {
    expect(STOP_SCRIPT).toContain("$ErrorActionPreference = 'Stop'");
    expect(STOP_SCRIPT.trimEnd().split("\n").at(-1)).toBe("if (& $running) { exit 1 }");
  });

  test("finds makensis where it was named, else says there is none", () => {
    expect(findMakensis({ AKAN_NATIVE_MAKENSIS: "/opt/nsis/makensis" })).toBe("/opt/nsis/makensis");
    expect(findMakensis({ PATH: "/nonexistent" })).toBe(Bun.which("makensis"));
  });
});

describe("the app folder's size", () => {
  test("counts every file's bytes and whole 4 KiB clusters, without following links", () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-size-"));
    try {
      mkdirSync(join(dir, "resources", "app"), { recursive: true });
      writeFileSync(join(dir, "board.exe"), Buffer.alloc(5000));
      writeFileSync(join(dir, "resources", "app", "index.html"), "x");
      writeFileSync(join(dir, "resources", "empty.json"), "");
      symlinkSync(join(dir, "resources"), join(dir, "loop"));
      expect(folderSize(dir)).toEqual({ bytes: 5001, disk: 8192 + 4096 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the installed path length", () => {
  test("names the deepest file, with Windows separators, without following links", () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-deepest-"));
    try {
      mkdirSync(join(dir, "resources", "server", "node_modules", "@scope", "pkg"), { recursive: true });
      writeFileSync(join(dir, "resources", "server", "node_modules", "@scope", "pkg", "index.js"), "");
      writeFileSync(join(dir, "a-long-top-level-file-name.txt"), "");
      symlinkSync(join(dir, "resources"), join(dir, "loop"));
      expect(deepestPath(dir)).toBe("resources\\server\\node_modules\\@scope\\pkg\\index.js");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("counts the user folder, the app name twice and the staging folder of this version's bundle id", () => {
    const base = installedPathLength("Board", "1.2.3", "");
    expect(installedPathLength("Board", "1.2.3", "x".repeat(10))).toBe(base + 10);
    expect(installedPathLength("Scoreboard", "1.2.3", "")).toBe(base + 10);
    expect(installedPathLength("Board", "10.20.300", "")).toBe(base + 4);
    const longest = `C:\\Users\\${"u".repeat(20)}\\AppData\\Local\\Programs\\Board.update-1.2.3-1790783805\\Board\\`;
    expect(base).toBe(longest.length);
    expect(base).toBeLessThan(WINDOWS_MAX_PATH);
  });
});

// biome-ignore-all lint/suspicious/noTemplateCurlyInString: an NSIS script spells its defines and macros ${NAME}
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deepestPath,
  findMakensis,
  installedPathLength,
  installerScript,
  WINDOWS_MAX_PATH,
} from "../src/platforms/windows-installer.ts";

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
  icon: "C:\\build\\gen\\app.ico",
  bootstrapper: "C:\\cache\\MicrosoftEdgeWebview2Setup.exe",
  stopScript: "C:\\build\\gen\\stop-app.ps1",
  outFile: "C:\\build\\board-1.2.0-x64-setup.exe",
};

describe("the Windows installer script", () => {
  const script = installerScript(input);
  const section = (from: string, to: string) => script.slice(script.indexOf(from), script.indexOf(to));

  test("installs for the user, where the updates plugin can swap the folder", () => {
    expect(script).toContain("RequestExecutionLevel user");
    expect(script).toContain('InstallDir "$LOCALAPPDATA\\Programs\\${APP_NAME}"');
    expect(script).toContain('!define APP_NAME "Board $$ign"');
    expect(script).toContain('VIProductVersion "1.2.0.7"');
    expect(script).toContain(
      '!define UNINSTALL_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.example.board"',
    );
  });

  test("keeps the uninstaller beside the folder an update replaces, and finds that folder from the entry", () => {
    expect(script).toContain('WriteUninstaller "$INSTDIR.uninstall.exe"');
    expect(script).toContain(`"UninstallString" '"$INSTDIR.uninstall.exe"'`);
    expect(script).toContain(`"QuietUninstallString" '"$INSTDIR.uninstall.exe" /S'`);
    expect(script).not.toContain("$INSTDIR\\uninstall.exe");
    expect(section("Function un.onInit", 'Section "Uninstall"')).toContain(
      'ReadRegStr $INSTDIR HKCU "${UNINSTALL_KEY}" "InstallLocation"',
    );
    expect(section('Section "Uninstall"', "SectionEnd\n`")).toContain('Delete "$INSTDIR.uninstall.exe"');
  });

  test("removes the whole folder only when the app is in it, else only what the build made", () => {
    const removeApp = section("!macro RemoveApp", "!macro RenameRetry");
    expect(removeApp).toContain('${If} ${FileExists} "$INSTDIR\\${EXE}"\n    RMDir /r "$INSTDIR"\n  ${Else}');
    expect(removeApp).toContain("!insertmacro RemoveEntries");
    const entries = section("!macro RemoveEntries", "!macro RemoveApp");
    expect(entries).toContain('Delete "$INSTDIR\\board.exe"');
    expect(entries).toContain('RMDir /r "$INSTDIR\\resources"');
    expect(script.match(/!insertmacro RemoveApp/g)).toHaveLength(1);
    expect(script.match(/File \/r "/g)).toHaveLength(1);
  });

  test("refuses a /D= folder that holds someone else's files", () => {
    const install = section('Section "Install"', "InitPluginsDir");
    expect(install).toContain('${DirState} "$INSTDIR" $0');
    expect(install).toContain('${AndIfNot} ${FileExists} "$INSTDIR\\${EXE}"');
    expect(install).toContain('${AndIf} "$INSTDIR" != "$LOCALAPPDATA\\Programs\\${APP_NAME}"');
    expect(install).toContain("!insertmacro Fail");
  });

  test("uninstalls what updates and setups left next to the folder", () => {
    const uninstall = section('Section "Uninstall"', "SectionEnd\n`");
    expect(uninstall).toContain('RMDir /r "$INSTDIR.previous"');
    expect(uninstall).toContain('!insertmacro RemoveSiblings "update-"');
    expect(uninstall).toContain('!insertmacro RemoveSiblings "failed-"');
    expect(uninstall).toContain('!insertmacro RemoveSiblings "setup-"');
    expect(uninstall).toContain("!insertmacro RemoveApp");
    expect(script).toContain('FindFirst $R0 $R1 "$INSTDIR.${SUFFIX}*"');
  });

  test("uninstalls the launch at login and the shell's update state, and keeps the user's data", () => {
    const uninstall = section('Section "Uninstall"', "SectionEnd\n`");
    expect(script).toContain('!define APP_ID "com.example.board"');
    expect(uninstall).toContain('DeleteRegValue HKCU "${RUN_KEY}" "${APP_ID}"');
    expect(uninstall).toContain('DeleteRegValue HKCU "${STARTUP_APPROVED_KEY}" "${APP_ID}"');
    expect(script).toContain('!define RUN_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Run"');
    expect(uninstall).toContain('RMDir /r "$LOCALAPPDATA\\${APP_ID}\\akan-native-updates"');
    expect(uninstall).toContain('RMDir "$LOCALAPPDATA\\${APP_ID}"');
    expect(uninstall).not.toContain('RMDir /r "$LOCALAPPDATA\\${APP_ID}"\n');
  });

  test("starts the app and the shortcut outside the folder an update renames", () => {
    const install = section('Section "Install"', "SectionEnd");
    const outside = install.indexOf('  SetOutPath "$LOCALAPPDATA"\n  File "/oname=$PLUGINSDIR\\stop-app.ps1"');
    expect(outside).toBeGreaterThan(install.indexOf('File /r "'));
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

  test("checks and unpacks everything before it stops the app, and swaps the folder by renames", () => {
    const install = section('Section "Install"', "SectionEnd");
    const stop = install.indexOf('stop-app.ps1" "$INSTDIR"');
    expect(install.indexOf("Call EnsureWebView2")).toBeLessThan(stop);
    expect(install.indexOf('SetOutPath "$INSTDIR.setup-new"')).toBeLessThan(install.indexOf('File /r "'));
    expect(install.indexOf('File /r "')).toBeLessThan(stop);
    expect(install.indexOf("StrCpy $AppStopped 1")).toBeGreaterThan(stop);
    const swap = install.slice(install.indexOf('!insertmacro RenameRetry "$INSTDIR" "$INSTDIR.setup-old"'));
    expect(swap).toContain('!insertmacro RenameRetry "$INSTDIR.setup-new" "$INSTDIR"');
    expect(swap).toContain(
      '${If} $R2 != "done"\n      !insertmacro RenameRetry "$INSTDIR.setup-old" "$INSTDIR"\n      RMDir /r "$INSTDIR.setup-new"\n      !insertmacro Fail',
    );
    expect(swap).toContain('RMDir /r "$INSTDIR.setup-old"');
    expect(install).not.toContain('SetOutPath "$INSTDIR"');
  });

  test("moves the new entries into a folder that holds other files, and keeps a setup's only copy of the app", () => {
    const install = section('Section "Install"', "SectionEnd");
    expect(install).toContain('Rename "$INSTDIR.setup-new\\board.exe" "$INSTDIR\\board.exe"');
    expect(install).toContain('Rename "$INSTDIR.setup-new\\resources" "$INSTDIR\\resources"');
    expect(install).toContain(
      '${If} $0 == -1\n  ${AndIf} ${FileExists} "$INSTDIR.setup-old\\${EXE}"\n    Rename "$INSTDIR.setup-old" "$INSTDIR"',
    );
    expect(install).toContain(
      '${If} ${FileExists} "$INSTDIR\\${EXE}"\n  ${OrIfNot} ${FileExists} "$INSTDIR.setup-old\\${EXE}"\n    RMDir /r "$INSTDIR.setup-old"',
    );
  });

  test("a failure after the app was stopped starts it again on /RUN", () => {
    const fail = section("!macro Fail", "!macroend");
    expect(fail).toContain("${If} $AppStopped == 1\n  ${AndIf} $RunAfter == 1\n    Call RunApp");
    expect(section("Function RunApp", "FunctionEnd")).toContain('${If} ${FileExists} "$INSTDIR\\${EXE}"');
  });

  test("a silent install that could not finish exits non-zero", () => {
    expect(script).toContain("ManifestLongPathAware true");
    expect(script).toContain(
      'ClearErrors\n  File /r "C:\\build\\Board $$ign\\*"\n  ${If} ${Errors}\n    SetOutPath "$LOCALAPPDATA"\n    RMDir /r "$INSTDIR.setup-new"\n    !insertmacro Fail',
    );
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

  test("finds makensis where it was named, else says there is none", () => {
    expect(findMakensis({ AKAN_NATIVE_MAKENSIS: "/opt/nsis/makensis" })).toBe("/opt/nsis/makensis");
    expect(findMakensis({ PATH: "/nonexistent" })).toBe(Bun.which("makensis"));
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

  test("counts the user folder, the app name twice and the update staging suffix", () => {
    const base = installedPathLength("Board", "");
    expect(installedPathLength("Board", "x".repeat(10))).toBe(base + 10);
    expect(installedPathLength("Scoreboard", "")).toBe(base + 10);
    expect(base).toBeLessThan(WINDOWS_MAX_PATH / 2);
  });
});

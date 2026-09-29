import { describe, expect, test } from "bun:test";
import { findMakensis, installerScript } from "../src/platforms/windows-installer.ts";

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

  test("installs for the user, where the updates plugin can swap the folder", () => {
    expect(script).toContain("RequestExecutionLevel user");
    expect(script).toContain('InstallDir "$LOCALAPPDATA\\Programs\\${APP_NAME}"');
    expect(script).toContain('!define APP_NAME "Board $$ign"');
    expect(script).toContain('VIProductVersion "1.2.0.7"');
    expect(script).toContain(
      '!define UNINSTALL_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.example.board"',
    );
  });

  test("removes only what the build made, never the whole folder /D= names", () => {
    expect(script).toContain('Delete "$INSTDIR\\board.exe"');
    expect(script).toContain('RMDir /r "$INSTDIR\\resources"');
    expect(script).not.toMatch(/RMDir \/r "\$INSTDIR"/);
    expect(script).toContain('RMDir "$INSTDIR"');
    expect(script).toContain('File /r "C:\\build\\Board $$ign\\*"');
  });

  test("stops a running copy by its path, installs WebView2 only when missing, and runs the app on /RUN", () => {
    expect(script.match(/stop-app\.ps1" "\$INSTDIR"/g)).toHaveLength(2);
    expect(script).toContain("{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}");
    expect(script).toContain("ExecWait '\"$PLUGINSDIR\\MicrosoftEdgeWebview2Setup.exe\" /silent /install' $1");
    expect(script).toContain('${GetOptions} $0 "/RUN" $1');
    expect(script).toContain('!define MUI_ICON "C:\\build\\gen\\app.ico"');
  });

  test("finds makensis where it was named, else says there is none", () => {
    expect(findMakensis({ AKAN_NATIVE_MAKENSIS: "/opt/nsis/makensis" })).toBe("/opt/nsis/makensis");
    expect(findMakensis({ PATH: "/nonexistent" })).toBe(Bun.which("makensis"));
  });
});

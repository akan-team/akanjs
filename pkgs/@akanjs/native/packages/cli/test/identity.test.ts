import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appNameProblem, buildNumberProblem, defaultFileName, projectFromConfig } from "../src/lib/project.ts";
import { moduleName } from "../src/platforms/ios.ts";

// Architecture review stage 6: app identity (Dioxus #5743/#5735, Electrobun #514).

describe("app identity", () => {
  test("app.name is a display name in any language, but a valid folder and shortcut name on every OS", () => {
    for (const name of ["Notes", "메모 앱", "Akan Native Sample", "Café (Beta)", "A.B"])
      expect(appNameProblem(name)).toBeNull();
    const bad: [unknown, RegExp][] = [
      ["", /required/],
      [" Notes", /spaces/],
      ["Notes ", /spaces/],
      ["My App.", /dot/],
      ["A/B", /"\/"/],
      ["C:\\x", /":"/],
      ["What?", /"\?"/],
      ["Tab\there", /control/],
      ["CON", /device/],
      ["com1.txt", /device/],
      ["nul", /device/],
      [42, /required/],
    ];
    for (const [name, message] of bad)
      expect([name, appNameProblem(name)]).toEqual([name, expect.stringMatching(message)]);
  });

  test("app.fileName defaults to the id's last part; executables and the Swift module come from it", () => {
    expect(defaultFileName("com.akanjs.sample")).toBe("sample");
    expect(defaultFileName("com.example.MyNotes")).toBe("mynotes");
    expect(defaultFileName("com.example.notes_2")).toBe("notes_2");
    expect(moduleName("sample")).toBe("sample");
    expect(moduleName("my-notes.app")).toBe("mynotesapp");
    expect(moduleName("2do")).toBe("App2do");
    const dir = mkdtempSync(join(tmpdir(), "akan-native-identity-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html>");
    const project = (app: Record<string, unknown>) =>
      projectFromConfig(
        { app: { id: "com.example.notes", name: "메모", version: "1.0.0", ...app }, web: { dir: "." } } as never,
        dir,
      );
    expect(project({}).config.app.fileName).toBe("notes");
    expect(project({ fileName: "Memo-App" }).config.app.fileName).toBe("Memo-App");
    expect(() => project({ fileName: "memo app" })).toThrow(/app.fileName must be/);
    expect(() => project({ name: "Memo." })).toThrow(/must not end with a dot/);
  });

  test("the build number: a positive integer; Android and Windows limits", () => {
    expect(buildNumberProblem(1, "ios")).toBeNull();
    expect(buildNumberProblem(2_100_000_000, "android")).toBeNull();
    expect(buildNumberProblem(2_100_000_001, "android")).toMatch(/versionCode/);
    expect(buildNumberProblem(65_535, "windows")).toBeNull();
    expect(buildNumberProblem(65_536, "windows")).toMatch(/65535/);
    expect(buildNumberProblem(65_536, "macos")).toBeNull();
    expect(buildNumberProblem(0, "linux")).toMatch(/positive integer/);
    expect(buildNumberProblem(1.5, "linux")).toMatch(/positive integer/);
  });
});

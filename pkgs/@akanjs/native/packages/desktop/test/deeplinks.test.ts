import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopEntry, desktopExec, linkArguments, registerDeepLinks, withDefaults } from "../src/deeplinks.ts";

const app = { id: "com.akanjs.sample", name: "Akan Native Sample" };

describe("deep links on Windows and Linux (D6)", () => {
  test("only a single argument of an app scheme is a link", () => {
    expect(linkArguments(["akansample://auth?code=1"], ["akansample"])).toEqual(["akansample://auth?code=1"]);
    expect(linkArguments(["AkanSample:x"], ["akansample"])).toEqual(["AkanSample:x"]);
    expect(linkArguments(["https://example.com"], ["akansample"])).toEqual([]);
    expect(linkArguments(["akansample://a", "--flag"], ["akansample"])).toEqual([]);
    expect(linkArguments([], ["akansample"])).toEqual([]);
    expect(linkArguments(["C:\\\\file.txt"], ["c"])).toEqual(["C:\\\\file.txt"]); // a drive letter is only a link if "c" is an app scheme
  });

  test("desktop entry: quoted Exec, x-scheme-handler MIME types, hidden", () => {
    expect(desktopExec('/opt/my "app"/run$1')).toBe('"/opt/my \\"app\\"/run\\$1" %u');
    const entry = desktopEntry("Akan Native Sample", "/opt/akan-native/akan-native-sample", ["akansample", "akan2"]);
    expect(entry).toContain('Exec="/opt/akan-native/akan-native-sample" %u\n');
    expect(entry).toContain("MimeType=x-scheme-handler/akansample;x-scheme-handler/akan2;\n");
    expect(entry).toContain("NoDisplay=true\n");
  });

  test("mimeapps.list: sets the defaults, keeps everything else", () => {
    expect(withDefaults("", "a.desktop", ["x"])).toBe("[Default Applications]\nx-scheme-handler/x=a.desktop;\n");
    const list =
      "[Added Associations]\ntext/plain=gedit.desktop;\n\n[Default Applications]\nx-scheme-handler/x=old.desktop;\ntext/html=firefox.desktop;\n";
    expect(withDefaults(list, "a.desktop", ["x", "y"])).toBe(
      "[Added Associations]\ntext/plain=gedit.desktop;\n\n[Default Applications]\nx-scheme-handler/x=a.desktop;\ntext/html=firefox.desktop;\nx-scheme-handler/y=a.desktop;\n",
    );
    expect(withDefaults("[Default Applications]\n[Other]\nk=v\n", "a.desktop", ["x"])).toBe(
      "[Default Applications]\nx-scheme-handler/x=a.desktop;\n[Other]\nk=v\n",
    );
  });

  test("Linux: writes the entry and the default once", async () => {
    const home = mkdtempSync(join(tmpdir(), "akan-native-links-"));
    const runs: string[][] = [];
    const run = async (argv: string[]) => (runs.push(argv), { code: 0, stdout: "" });
    const env = { XDG_DATA_HOME: join(home, "data"), XDG_CONFIG_HOME: join(home, "config") };
    mkdirSync(env.XDG_CONFIG_HOME);
    writeFileSync(join(env.XDG_CONFIG_HOME, "mimeapps.list"), "[Default Applications]\ntext/html=firefox.desktop;\n");
    await registerDeepLinks(app, ["akansample"], {
      platform: "linux",
      exe: "/opt/akan-native-sample/akan-native-sample",
      env,
      home,
      run,
    });
    expect(readFileSync(join(env.XDG_DATA_HOME, "applications", "com.akanjs.sample.desktop"), "utf8")).toContain(
      "x-scheme-handler/akansample;",
    );
    expect(readFileSync(join(env.XDG_CONFIG_HOME, "mimeapps.list"), "utf8")).toBe(
      "[Default Applications]\ntext/html=firefox.desktop;\nx-scheme-handler/akansample=com.akanjs.sample.desktop;\n",
    );
    expect(runs).toEqual([["update-desktop-database", join(env.XDG_DATA_HOME, "applications")]]);
    await registerDeepLinks(app, ["akansample"], {
      platform: "linux",
      exe: "/opt/akan-native-sample/akan-native-sample",
      env,
      home,
      run,
    });
    expect(runs).toHaveLength(1); // unchanged: nothing rewritten
  });

  test("Windows: HKCU\\Software\\Classes keys, skipped when the command is already ours", async () => {
    const runs: string[][] = [];
    let registered = false;
    const run = async (argv: string[]) => {
      runs.push(argv);
      if (argv[1] === "query")
        return registered
          ? {
              code: 0,
              stdout:
                '\r\nHKEY_CURRENT_USER\\Software\\Classes\\akansample\\shell\\open\\command\r\n    (Default)    REG_SZ    "C:\\Apps\\Akan Native Sample\\akan-native-sample.exe" "%1"\r\n\r\n',
            }
          : { code: 1, stdout: "" };
      return { code: 0, stdout: "" };
    };
    const exe = "C:\\Apps\\Akan Native Sample\\akan-native-sample.exe";
    await registerDeepLinks(app, ["akansample"], { platform: "win32", exe, run });
    expect(runs.filter((r) => r[1] === "add")).toEqual([
      [
        "reg.exe",
        "add",
        "HKCU\\Software\\Classes\\akansample",
        "/ve",
        "/t",
        "REG_SZ",
        "/d",
        "URL:Akan Native Sample",
        "/f",
      ],
      ["reg.exe", "add", "HKCU\\Software\\Classes\\akansample", "/v", "URL Protocol", "/t", "REG_SZ", "/d", "", "/f"],
      [
        "reg.exe",
        "add",
        "HKCU\\Software\\Classes\\akansample\\DefaultIcon",
        "/ve",
        "/t",
        "REG_SZ",
        "/d",
        `${exe},0`,
        "/f",
      ],
      [
        "reg.exe",
        "add",
        "HKCU\\Software\\Classes\\akansample\\shell\\open\\command",
        "/ve",
        "/t",
        "REG_SZ",
        "/d",
        `"${exe}" "%1"`,
        "/f",
      ],
    ]);
    registered = true;
    runs.length = 0;
    await registerDeepLinks(app, ["akansample"], { platform: "win32", exe, run });
    expect(runs.map((r) => r[1])).toEqual(["query"]);
  });

  test("nothing to do on macOS or without schemes", async () => {
    const run = async () => {
      throw new Error("must not run");
    };
    await registerDeepLinks(app, ["akansample"], { platform: "darwin", run });
    await registerDeepLinks(app, [], { platform: "linux", run });
  });
});

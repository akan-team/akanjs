// Never calls SMAppService: the shell is scripted. Registering for real adds a login item to the Mac.
// The Linux entries go to a temporary folder.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { fakeHost } from "../../menu/test/fake-host.ts";
import manifest from "../native-plugin.json";
import {
  autostartDir,
  createDesktopAutostart,
  desktopEntry,
  desktopExec,
  entryStatus,
  failure,
  linuxAutostart,
  type ShellError,
} from "../src/desktop.ts";
import { autostart } from "../src/index.ts";

const desktop = createDesktopAutostart("darwin");

let mock: MockHost | null = null;
afterEach(() => {
  mock?.uninstall();
  mock = null;
});

const err = (reason: ShellError["reason"], code: number): ShellError => ({
  reason,
  code,
  domain: "SMAppServiceErrorDomain",
  message: "x",
});

describe("autostart plugin", () => {
  test("desktop only", async () => {
    const plugin = { spec: "autostart", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "ios")).toEqual({});
    expect(pluginDecls([plugin], "macos")).toEqual({ autostart: { methods: manifest.methods, events: [] } });
    mock = installMockHost({ platform: "android", plugins: {} });
    expect(await autostart.isEnabled().catch((e) => e.code)).toBe("UNSUPPORTED");
  });

  test("isEnabled reads the status only", async () => {
    const host = fakeHost(desktop, () => ({ status: "notFound" }));
    expect(await host.call("isEnabled")).toMatchObject({ ok: true, result: { enabled: false, status: "notFound" } });
    await host.call("openSettings");
    expect(host.shell.map((c) => c.op)).toEqual(["autostart.status", "autostart.openSettings"]);
    expect(host.shell[0]!.args).toMatchObject({ id: "dev.test" }); // the Windows Run value's name
  });

  test("Windows: the shell's answers, with the Startup page in the messages", async () => {
    const answers: Record<string, unknown> = {
      "autostart.status": { status: "requiresApproval" },
      "autostart.enable": { status: "requiresApproval", error: null },
      "autostart.disable": { status: "notRegistered", error: null },
    };
    const host = fakeHost(createDesktopAutostart("win32"), (op) => answers[op]);
    expect(await host.call("isEnabled")).toMatchObject({
      ok: true,
      result: { enabled: false, status: "requiresApproval" },
    });
    const denied = await host.call("enable");
    expect(denied).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(JSON.stringify(denied)).toContain("Settings › Apps › Startup");
    expect(await host.call("disable")).toMatchObject({ ok: true, result: { enabled: false, status: "notRegistered" } });
    const win32Error = { reason: "other" as const, code: 5, domain: "Win32", message: "Access is denied." };
    expect(failure("enable", { status: "notRegistered", error: win32Error }, "win32")?.message).toContain(
      "Access is denied. (Win32 5)",
    );
  });

  test("enable and disable resolve when the app ends up where it was asked to be", async () => {
    const answers: Record<string, unknown> = {
      "autostart.enable": { status: "enabled", error: err("alreadyRegistered", 12) },
      "autostart.disable": { status: "notRegistered", error: null },
    };
    const host = fakeHost(desktop, (op) => answers[op]);
    expect(await host.call("enable")).toMatchObject({ ok: true, result: { enabled: true, status: "enabled" } });
    expect(await host.call("disable")).toMatchObject({ ok: true, result: { enabled: false, status: "notRegistered" } });
    answers["autostart.enable"] = { status: "requiresApproval", error: err("deniedByUser", 11) };
    expect(await host.call("enable")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  });

  test("what errors mean", () => {
    expect(failure("enable", { status: "enabled" })).toBeNull();
    expect(failure("enable", { status: "enabled", error: err("alreadyRegistered", 12) })).toBeNull();
    expect(failure("enable", { status: "requiresApproval" })?.code).toBe("PERMISSION_DENIED");
    expect(failure("enable", { status: "notFound", error: err("invalidSignature", 3) })?.message).toContain(
      "code signature",
    );
    expect(failure("enable", { status: "notFound", error: err("other", 2) })?.code).toBe("INTERNAL");
    expect(failure("enable", { status: "notFound" })?.code).toBe("INTERNAL");
    expect(failure("disable", { status: "notFound", error: err("notRegistered", 6) })).toBeNull();
    // Seen on macOS 26 for an app that never registered.
    expect(
      failure("disable", {
        status: "notFound",
        error: { reason: "other", code: 1, domain: "SMAppServiceErrorDomain", message: "Operation not permitted" },
      }),
    ).toBeNull();
    expect(failure("disable", { status: "notRegistered" })).toBeNull();
    expect(failure("disable", { status: "enabled", error: err("other", 2) })?.code).toBe("INTERNAL");
  });
});

describe("autostart on Linux (XDG autostart)", () => {
  test("the folder follows XDG_CONFIG_HOME when it is absolute", () => {
    expect(autostartDir({}, "/home/u")).toBe("/home/u/.config/autostart");
    expect(autostartDir({ XDG_CONFIG_HOME: "/cfg" }, "/home/u")).toBe("/cfg/autostart");
    expect(autostartDir({ XDG_CONFIG_HOME: "relative" }, "/home/u")).toBe("/home/u/.config/autostart");
  });

  test("Exec quoting and the entry", () => {
    expect(desktopExec("/opt/akan-native-sample/akan-native-sample")).toBe(
      '"/opt/akan-native-sample/akan-native-sample"',
    );
    // Quoting rule first (\" \` \$ \\), then the string escaping doubles every backslash; % is %%.
    expect(desktopExec('/home/u/My Apps/a "b" $c `d` 100%\\e')).toBe(
      '"/home/u/My Apps/a \\\\"b\\\\" \\\\$c \\\\`d\\\\` 100%%\\\\\\\\e"',
    );
    const entry = desktopEntry("Akan Native\nSample", "/opt/app");
    expect(entry.split("\n")).toEqual([
      "[Desktop Entry]",
      "Type=Application",
      "Version=1.5",
      "Name=Akan Native Sample",
      'Exec="/opt/app"',
      "Terminal=false",
      "X-GNOME-Autostart-enabled=true",
      "",
    ]);
  });

  test("status from the entry", () => {
    expect(entryStatus(null)).toBe("notRegistered");
    expect(entryStatus(desktopEntry("A", "/a"))).toBe("enabled");
    expect(entryStatus("[Desktop Entry]\nExec=/a\nX-GNOME-Autostart-enabled=false\n")).toBe("requiresApproval");
    expect(entryStatus("[Desktop Entry]\nExec=/a\nHidden=true\n")).toBe("requiresApproval");
    // Keys of other groups do not count.
    expect(entryStatus("[Desktop Entry]\nExec=/a\n[Desktop Action x]\nHidden=true\n")).toBe("enabled");
  });

  test("enable writes <app id>.desktop, disable removes it; an entry switched off is switched on again", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "akan-native-autostart-")), "autostart");
    const host = fakeHost(
      createDesktopAutostart(
        "linux",
        linuxAutostart(
          () => dir,
          () => "/opt/test/Test App",
        ),
      ),
    );
    const file = join(dir, "dev.test.desktop");
    expect(await host.call("isEnabled")).toMatchObject({
      ok: true,
      result: { enabled: false, status: "notRegistered" },
    });
    expect(await host.call("disable")).toMatchObject({ ok: true, result: { status: "notRegistered" } });
    expect(await host.call("enable")).toMatchObject({ ok: true, result: { enabled: true, status: "enabled" } });
    expect(readFileSync(file, "utf8")).toContain('Exec="/opt/test/Test App"\n');
    expect(readFileSync(file, "utf8")).toContain("Name=Test\n");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace("X-GNOME-Autostart-enabled=true", "X-GNOME-Autostart-enabled=false"),
    );
    expect(await host.call("isEnabled")).toMatchObject({ result: { enabled: false, status: "requiresApproval" } });
    expect(await host.call("enable")).toMatchObject({ ok: true, result: { status: "enabled" } });
    expect(await host.call("disable")).toMatchObject({ ok: true, result: { enabled: false, status: "notRegistered" } });
    expect(existsSync(file)).toBe(false);
    expect(await host.call("openSettings")).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
    expect(host.shell).toEqual([]); // no shell ops on Linux
  });
});

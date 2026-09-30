import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nextRelaunchDelay,
  RELAUNCH_HEALTHY,
  RELAUNCH_LIMIT,
  recoveryCommand,
  recoveryScript,
} from "../src/relaunch.ts";

const dir = mkdtempSync(join(tmpdir(), "akan-native-relaunch-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const windows = process.platform === "win32";

/** A stand-in app that writes whether the process that relaunched it still runs. */
function standIn(marker: string): string {
  if (windows) {
    const app = join(dir, "app.cmd");
    writeFileSync(
      app,
      `@echo off\r\ntasklist /FI "PID eq %AKAN_NATIVE_PARENT%" /NH | find "%AKAN_NATIVE_PARENT%" >nul && (echo running%AKAN_NATIVE_QUIT_ON_STDIN%>> "${marker}") || (echo gone%AKAN_NATIVE_QUIT_ON_STDIN%>> "${marker}")\r\n`,
    );
    return app;
  }
  const app = join(dir, "app.sh");
  writeFileSync(
    app,
    `#!/bin/sh\nif kill -0 "$AKAN_NATIVE_PARENT" 2>/dev/null; then echo "running$AKAN_NATIVE_QUIT_ON_STDIN" >> "${marker}"; else echo "gone$AKAN_NATIVE_QUIT_ON_STDIN" >> "${marker}"; fi\n`,
  );
  chmodSync(app, 0o755);
  return app;
}

describe("relaunchAfterExit", () => {
  test("starts the app again only once this process is gone, after the renames, without the CLI's stdin contract", async () => {
    const marker = join(dir, "marker");
    const app = standIn(marker);
    writeFileSync(join(dir, "old"), "");
    const script = join(dir, "exiting.ts");
    writeFileSync(
      script,
      `import { relaunchAfterExit } from ${JSON.stringify(join(import.meta.dir, "../src/relaunch.ts"))};
await relaunchAfterExit(${JSON.stringify(app)}, [[${JSON.stringify(join(dir, "old"))}, ${JSON.stringify(join(dir, "new"))}]]);
await Bun.sleep(500);
process.exit(0);
`,
    );
    const exiting = Bun.spawn([process.execPath, script], {
      env: { ...process.env, AKAN_NATIVE_QUIT_ON_STDIN: "1" },
      stdout: "inherit",
      stderr: "inherit",
    });
    await Bun.sleep(200);
    expect(existsSync(marker)).toBe(false);
    expect(await exiting.exited).toBe(0);
    for (let waited = 0; !existsSync(marker) && waited < 15_000; waited += 100) await Bun.sleep(100);
    expect(readFileSync(marker, "utf8").trim()).toBe("gone");
    expect([existsSync(join(dir, "old")), existsSync(join(dir, "new"))]).toEqual([false, true]);
  }, 30_000);

  test("starts one app however often a process asks, and waits the delay after it exited", async () => {
    const marker = join(dir, "marker-once");
    const app = standIn(marker);
    const script = join(dir, "twice.ts");
    writeFileSync(
      script,
      `import { relaunchAfterExit } from ${JSON.stringify(join(import.meta.dir, "../src/relaunch.ts"))};
await Promise.all([relaunchAfterExit(${JSON.stringify(app)}, [], { delayMs: 1500 }), relaunchAfterExit(${JSON.stringify(app)})]);
await Bun.sleep(300);
process.exit(0);
`,
    );
    const exiting = Bun.spawn([process.execPath, script], { stdout: "inherit", stderr: "inherit" });
    expect(await exiting.exited).toBe(0);
    await Bun.sleep(700);
    expect(existsSync(marker)).toBe(false);
    for (let waited = 0; !existsSync(marker) && waited < 15_000; waited += 100) await Bun.sleep(100);
    await Bun.sleep(1500);
    expect(readFileSync(marker, "utf8").trim().split(/\r?\n/)).toEqual(["gone"]);
  }, 30_000);
});

describe("relaunchAfterExit on macOS and Linux", () => {
  test("puts the first rename back when the second one fails", async () => {
    if (windows) return;
    const script = join(dir, "half.ts");
    writeFileSync(join(dir, "app-folder"), "");
    writeFileSync(
      script,
      `import { relaunchAfterExit } from ${JSON.stringify(join(import.meta.dir, "../src/relaunch.ts"))};
const moves = [[${JSON.stringify(join(dir, "app-folder"))}, ${JSON.stringify(join(dir, "app-folder.previous"))}], [${JSON.stringify(join(dir, "missing"))}, ${JSON.stringify(join(dir, "app-folder"))}]];
await relaunchAfterExit("/usr/bin/true", moves).then(() => process.exit(3), () => process.exit(0));
`,
    );
    const run = Bun.spawn([process.execPath, script], { stdout: "inherit", stderr: "ignore" });
    expect(await run.exited).toBe(0);
    expect([existsSync(join(dir, "app-folder")), existsSync(join(dir, "app-folder.previous"))]).toEqual([true, false]);
  });

  test("starts the app once its parent is gone, even when nobody reaps that parent", async () => {
    if (windows) return;
    const marker = join(dir, "marker-zombie");
    const app = standIn(marker);
    const script = join(dir, "zombie.ts");
    writeFileSync(
      script,
      `import { relaunchAfterExit } from ${JSON.stringify(join(import.meta.dir, "../src/relaunch.ts"))};
await relaunchAfterExit(${JSON.stringify(app)});
process.exit(0);
`,
    );
    //? `exec sleep` replaces the shell that started the app with a parent that never waits: the app stays a zombie.
    const keeper = Bun.spawn(["/bin/sh", "-c", `"${process.execPath}" "${script}" & exec sleep 8`], {
      stdout: "inherit",
      stderr: "inherit",
    });
    try {
      for (let waited = 0; !existsSync(marker) && waited < 5_000; waited += 100) await Bun.sleep(100);
      expect(existsSync(marker)).toBe(true);
    } finally {
      keeper.kill("SIGKILL");
    }
  }, 20_000);
});

describe("the recovery of a Windows swap cut short", () => {
  test("puts back only what a missing app lost, then starts it; a command RunOnce can run", () => {
    const script = recoveryScript("C:\\Users\\O'Brien\\App\\app.exe", [
      ["C:\\Users\\O'Brien\\App", "C:\\Users\\O'Brien\\App.previous"],
      ["C:\\Users\\O'Brien\\App.update-1\\App", "C:\\Users\\O'Brien\\App"],
    ]);
    expect(script).toContain("$exe = 'C:\\Users\\O''Brien\\App\\app.exe'");
    expect(script).toContain("if (Test-Path -LiteralPath $exe) { exit }");
    expect(script).toContain("[array]::Reverse($moves)");
    expect(recoveryCommand("C:\\Users\\me\\AppData\\Local\\dev.app\\akan-native-updates\\recover.ps1")).toContain(
      "[IO.File]::ReadAllText('C:\\Users\\me",
    );
    expect(recoveryCommand(`C:\\${"x".repeat(300)}\\recover.ps1`)).toBeNull();
  });
});

describe("relaunching after the browser process ended", () => {
  test("waits 1 s doubling to a minute while each relaunched app dies young, and stops after the limit", () => {
    const file = join(dir, "streak", "relaunch.json");
    let now = 1_000_000;
    const delays: (number | null)[] = [];
    for (let n = 0; n <= RELAUNCH_LIMIT; n++) {
      const delay = nextRelaunchDelay(file, now);
      delays.push(delay);
      now += (delay ?? 0) + 5_000;
    }
    expect(delays).toEqual([0, 1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000, null]);
  });

  test("an app that ran for a minute starts the count again", () => {
    const file = join(dir, "healthy", "relaunch.json");
    expect(nextRelaunchDelay(file, 0)).toBe(0);
    expect(nextRelaunchDelay(file, 5_000)).toBe(1000);
    expect(nextRelaunchDelay(file, 6_000 + RELAUNCH_HEALTHY)).toBe(0);
  });
});

import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "akan-native-relaunch-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const windows = process.platform === "win32";

/** A stand-in app that writes whether the process that relaunched it still runs. */
function standIn(marker: string): string {
  if (windows) {
    const app = join(dir, "app.cmd");
    writeFileSync(
      app,
      `@echo off\r\ntasklist /FI "PID eq %AKAN_NATIVE_PARENT%" /NH | find "%AKAN_NATIVE_PARENT%" >nul && (echo running%AKAN_NATIVE_QUIT_ON_STDIN%> "${marker}") || (echo gone%AKAN_NATIVE_QUIT_ON_STDIN%> "${marker}")\r\n`,
    );
    return app;
  }
  const app = join(dir, "app.sh");
  writeFileSync(
    app,
    `#!/bin/sh\nif kill -0 "$AKAN_NATIVE_PARENT" 2>/dev/null; then echo "running$AKAN_NATIVE_QUIT_ON_STDIN" > "${marker}"; else echo "gone$AKAN_NATIVE_QUIT_ON_STDIN" > "${marker}"; fi\n`,
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
});

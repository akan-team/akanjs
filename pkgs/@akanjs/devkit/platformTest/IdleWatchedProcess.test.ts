import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../test/testHelpers";
import { IdleWatchedProcess } from "./IdleWatchedProcess";

const makeRoot = tempDirs("akan-idle-watch-");
const makeLogPath = async () => path.join(await makeRoot(), "nested", "run.log");

describe("IdleWatchedProcess", () => {
  test("tees the output of a command that finishes into the log and reports its exit code", async () => {
    const logPath = await makeLogPath();
    const result = await new IdleWatchedProcess(
      [process.execPath, "--eval", "console.log('out'); console.error('err'); process.exit(3)"],
      { logPath, idleMs: 10_000 },
    ).run();

    expect(result.exitCode).toBe(3);
    expect(result.hung).toBe(false);
    expect(result.output).toContain("out");
    expect(result.output).toContain("err");
    expect(await readFile(logPath, "utf8")).toContain("out");
  });

  test("gives up on a command that goes quiet, after asking the caller to clean up", async () => {
    const logPath = await makeLogPath();
    let cleanedUp = false;
    const result = await new IdleWatchedProcess(
      [process.execPath, "--eval", "console.log('started'); setInterval(() => {}, 1000)"],
      {
        logPath,
        idleMs: 400,
        onIdle: async () => {
          cleanedUp = true;
        },
      },
    ).run();

    expect(result.hung).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(cleanedUp).toBe(true);
    expect(result.output).toContain("started");
  });

  test("a command that keeps talking is not idle, but still stops at the total budget", async () => {
    const logPath = await makeLogPath();
    const result = await new IdleWatchedProcess(
      [process.execPath, "--eval", "setInterval(() => console.log('tick'), 50)"],
      { logPath, idleMs: 5_000, totalMs: 500 },
    ).run();

    expect(result.hung).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });
});

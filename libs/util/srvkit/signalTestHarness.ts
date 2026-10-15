import { existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class SignalTestHarness {
  static #scratchDir: string | null = null;
  //? akan build inlines NODE_ENV as "production", so no built server can pass; only bun test pairs "test" with the harness's "testing" env.
  //? Read off process.env rather than getEnv(), which throws in an adapter unit test that never set AKAN_PUBLIC_APP_NAME.
  static isRunning() {
    return process.env.NODE_ENV === "test" && process.env.AKAN_PUBLIC_ENV === "testing";
  }
  //? Never the workspace's local/ that `akan start` serves its blobs from. bun test fires no exit event, so each run sweeps the dirs of runs whose process is gone.
  static scratchDir() {
    if (!SignalTestHarness.#scratchDir) {
      const parent = join(tmpdir(), "akan-signal-test");
      for (const entry of existsSync(parent) ? readdirSync(parent) : [])
        if (!SignalTestHarness.#isAlive(Number(entry))) rmSync(join(parent, entry), { recursive: true, force: true });
      SignalTestHarness.#scratchDir = join(parent, String(process.pid));
    }
    return SignalTestHarness.#scratchDir;
  }
  static #isAlive(pid: number) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM";
    }
  }
}

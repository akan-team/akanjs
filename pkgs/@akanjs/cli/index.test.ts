import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("the entry drops AKAN_CLI_FORCE_BUILD before any command can spawn a nested akan", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "cli-entry-"));
  dirs.push(dir);
  const probe = path.join(dir, "probe.ts");
  await Bun.write(
    probe,
    'process.on("exit", () => process.stderr.write("force=" + (process.env.AKAN_CLI_FORCE_BUILD ?? "unset")));\n',
  );
  const proc = Bun.spawn([process.execPath, "--preload", probe, path.join(import.meta.dir, "index.ts"), "--version"], {
    env: { ...process.env, AKAN_CLI_FORCE_BUILD: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  expect(exitCode).toBe(0);
  expect(stderr).toContain("force=unset");
}, 30_000);

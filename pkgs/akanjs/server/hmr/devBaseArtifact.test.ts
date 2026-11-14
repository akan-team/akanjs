import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DevBaseArtifact } from "./devBaseArtifact";

const dirs: string[] = [];
const artifactDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "akan-dev-artifact-"));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("DevBaseArtifact.arrived", () => {
  const beside = () => ({ AKAN_DEV_AWAIT_ARTIFACT: "1" });

  test("returns at once for a server that was not booted beside a base build, artifact or not", async () => {
    expect(await DevBaseArtifact.arrived({ artifactDir: await artifactDir(), env: {} })).toBe(0);
  });

  test("holds a server booted beside the base build until the artifact is on disk", async () => {
    const dir = await artifactDir();
    let arrived = false;
    const waiting = DevBaseArtifact.arrived({ artifactDir: dir, env: beside() }).then((waitedMs) => {
      arrived = true;
      return waitedMs;
    });
    await Bun.sleep(80);
    expect(arrived).toBe(false);

    await writeFile(join(dir, "base-artifact.json.tmp"), "{}");
    await Bun.sleep(60);
    expect(arrived).toBe(false);
    await writeFile(join(dir, "base-artifact.json"), "{}");

    expect(await waiting).toBeGreaterThanOrEqual(80);
  });

  test("drops the key once the artifact is seen, so nothing spawned afterwards waits again, and keeps it while it is not", async () => {
    const dir = await artifactDir();
    const waited: Record<string, string> = beside();
    const stopAt = performance.now() + 40;
    await DevBaseArtifact.arrived({ artifactDir: dir, env: waited, stopped: () => performance.now() >= stopAt });
    expect(waited).toEqual(beside());

    await writeFile(join(dir, "base-artifact.json"), "{}");
    await DevBaseArtifact.arrived({ artifactDir: dir, env: waited });

    expect(waited).toEqual({});
  });

  test("warns once, naming the file, when the artifact is still missing after the limit", async () => {
    const dir = await artifactDir();
    const warnings: string[] = [];
    let stopped = false;
    const waiting = DevBaseArtifact.arrived({
      artifactDir: dir,
      env: beside(),
      stopped: () => stopped,
      warnAfterMs: 40,
      warn: (message) => void warnings.push(message),
    });
    await Bun.sleep(30);
    expect(warnings).toEqual([]);
    await Bun.sleep(150);
    stopped = true;
    await waiting;

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(join(dir, "base-artifact.json"));
  });

  test("does not wait when the artifact is already there", async () => {
    const dir = await artifactDir();
    await writeFile(join(dir, "base-artifact.json"), "{}");

    expect(await DevBaseArtifact.arrived({ artifactDir: dir, env: beside() })).toBeLessThan(20);
  });

  test("gives the wait up once the server is stopped", async () => {
    let stopped = false;
    const waiting = DevBaseArtifact.arrived({
      artifactDir: await artifactDir(),
      env: beside(),
      stopped: () => stopped,
    });
    await Bun.sleep(40);
    stopped = true;

    expect(await waiting).toBeGreaterThan(0);
  });
});

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
  const beside = { AKAN_DEV_AWAIT_ARTIFACT: "1" };

  test("returns at once for a server that was not booted beside a base build, artifact or not", async () => {
    expect(await DevBaseArtifact.arrived({ artifactDir: await artifactDir(), env: {} })).toBe(0);
  });

  test("holds a server booted beside the base build until the artifact is on disk", async () => {
    const dir = await artifactDir();
    let arrived = false;
    const waiting = DevBaseArtifact.arrived({ artifactDir: dir, env: beside }).then((waitedMs) => {
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

  test("does not wait when the artifact is already there", async () => {
    const dir = await artifactDir();
    await writeFile(join(dir, "base-artifact.json"), "{}");

    expect(await DevBaseArtifact.arrived({ artifactDir: dir, env: beside })).toBeLessThan(20);
  });

  test("gives the wait up once the server is stopped", async () => {
    let stopped = false;
    const waiting = DevBaseArtifact.arrived({ artifactDir: await artifactDir(), env: beside, stopped: () => stopped });
    await Bun.sleep(40);
    stopped = true;

    expect(await waiting).toBeGreaterThan(0);
  });
});

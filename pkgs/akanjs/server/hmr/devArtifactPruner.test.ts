import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DevArtifactPruner } from "./devArtifactPruner";

describe("DevArtifactPruner", () => {
  let artifactDir: string;

  beforeEach(async () => {
    artifactDir = await mkdtemp(path.join(os.tmpdir(), "akan-dev-artifact-"));
    await mkdir(path.join(artifactDir, "server"), { recursive: true });
    await mkdir(path.join(artifactDir, "styles"), { recursive: true });
  });

  afterEach(async () => {
    await rm(artifactDir, { recursive: true, force: true });
  });

  const writeAged = async (relPath: string, ageMs: number) => {
    const file = path.join(artifactDir, relPath);
    await writeFile(file, relPath);
    const at = new Date(Date.now() - ageMs);
    await utimes(file, at, at);
    return file;
  };
  const writeBaseArtifact = async (pagesBundlePath: string, cssRelPath: string) =>
    await writeFile(
      path.join(artifactDir, "base-artifact.json"),
      JSON.stringify({ pagesBundlePath, cssAssets: { "": { cssUrl: `/_akan/${cssRelPath}`, cssRelPath } } }),
    );
  const list = async (dir: string) => (await readdir(path.join(artifactDir, dir))).sort();

  test("removes the bundles older than the running one, keeping the base artifact's and those written after it", async () => {
    const base = await writeAged("server/pages-base.js", 600_000);
    await writeAged("server/pages-old.js", 300_000);
    const running = await writeAged("server/pages-running.js", 120_000);
    await writeAged("server/pages-failed.js", 90_000);
    await writeAged("server/server-graph.json", 600_000);
    await writeBaseArtifact(base, "styles/root-a.css");
    await new DevArtifactPruner(artifactDir, { graceMs: 60_000 }).prunePages(running);
    expect(await list("server")).toEqual(["pages-base.js", "pages-failed.js", "pages-running.js", "server-graph.json"]);
  });

  test("leaves a bundle superseded within the grace, which another replica may still be importing", async () => {
    await writeAged("server/pages-recent.js", 30_000);
    const running = await writeAged("server/pages-running.js", 10_000);
    await new DevArtifactPruner(artifactDir, { graceMs: 60_000 }).prunePages(running);
    expect(await list("server")).toEqual(["pages-recent.js", "pages-running.js"]);
  });

  test("keeps the stylesheets the tabs and the base artifact name, and drops the rest once the grace passed", async () => {
    await writeAged("styles/root-a.css", 600_000);
    await writeAged("styles/root-b.css", 300_000);
    await writeAged("styles/root-c.css", 120_000);
    await writeAged("styles/root-d.css", 10_000);
    await writeBaseArtifact(path.join(artifactDir, "server/pages-base.js"), "styles/root-a.css");
    await new DevArtifactPruner(artifactDir, { graceMs: 60_000 }).pruneStyles({
      "": { cssUrl: "/_akan/styles/root-c.css", cssRelPath: "styles/root-c.css" },
    });
    expect(await list("styles")).toEqual(["root-a.css", "root-c.css", "root-d.css"]);
  });

  test("prunes nothing when the running bundle is not on disk", async () => {
    await writeAged("server/pages-old.js", 600_000);
    await new DevArtifactPruner(artifactDir, { graceMs: 0 }).prunePages(path.join(artifactDir, "server/pages-gone.js"));
    expect(await list("server")).toEqual(["pages-old.js"]);
  });
});

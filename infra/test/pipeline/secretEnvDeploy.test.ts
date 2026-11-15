import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const jenkinsfile = await Bun.file(path.join(import.meta.dir, "../../../Jenkinsfile")).text();
const start = jenkinsfile.indexOf("bun run runAkan secret-env $app");
const block = jenkinsfile.slice(
  jenkinsfile.lastIndexOf("try {", start),
  jenkinsfile.lastIndexOf("\n", jenkinsfile.indexOf("helm upgrade app", start)),
);
const steps = block
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("//"));
const masterCopy = "$REPO_NAME/$BRANCH/infra/master/$app-secret-env.yaml";
const indexOf = (part: string) => steps.findIndex((line) => line.includes(part));

describe("the pipeline's secret env step", () => {
  it("removes the copy on master whether or not removing the build host's copy worked", () => {
    const removals = steps.slice(indexOf("} finally {"));
    expect(
      removals.map((line) => (line.startsWith("sh ") ? line.replace(/^.*\\"(rm -f [^\\]+)\\""$/, "$1") : line)),
    ).toEqual([
      "} finally {",
      "try {",
      "rm -f $REPO_NAME/$BRANCH/local/$app-secret-env.yaml",
      "} finally {",
      `rm -f ${masterCopy}`,
      "}",
      "}",
    ]);
  });

  it("checks that the file piped to master is not empty before applying it, and says so when it is", async () => {
    const check = indexOf(`test -s ${masterCopy}`);
    expect(check).toBeGreaterThan(indexOf(`cat > ${masterCopy}`));
    expect(check).toBeLessThan(indexOf("kubectl apply -f master/$app-secret-env.yaml"));
    const remote = /\\"(test -s .*)\\""$/.exec(steps[check] ?? "")?.[1] ?? "";
    const dir = await mkdtemp(path.join(os.tmpdir(), "akan-secret-env-deploy-"));
    try {
      const file = path.join(dir, "demo-secret-env.yaml");
      const run = () =>
        Bun.spawnSync(["sh", "-c", remote.replaceAll(masterCopy, file).replaceAll("$app", "demo")], {
          stderr: "pipe",
        });
      await writeFile(file, "");
      const empty = run();
      expect(empty.exitCode).toBe(1);
      expect(empty.stderr.toString()).toBe(
        "The secret env of demo did not reach master: infra/master/demo-secret-env.yaml is empty, so nothing was applied.\n",
      );
      await rm(file);
      expect(run().exitCode).toBe(1);
      await writeFile(file, "apiVersion: v1\n");
      const written = run();
      expect(written.exitCode).toBe(0);
      expect(written.stderr.toString()).toBe("");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

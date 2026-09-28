import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createTempApp, tempRoots, writeText } from "../testHelpers";
import { BuildBatchRunner } from "./buildBatchRunner";

const track = tempRoots();

describe("BuildBatchRunner", () => {
  test("reports a boot build the bundler refuses with where each reason sits in the workspace", async () => {
    // Inside the checkout so `akanjs/server` resolves to its source: from the OS temp dir Bun auto-installs npm's 2.x.
    const { root } = track(await createTempApp("demo", path.join(import.meta.dir, "..", "local")));
    const appDir = path.join(root, "apps/demo");
    await writeText(path.join(appDir, "env/env.client.ts"), "export const env = {} as const;\n");
    await writeText(
      path.join(appDir, "page/_index.tsx"),
      'import { gone } from "./not-there";\nexport default gone;\n',
    );

    const result = await new BuildBatchRunner({ workspaceRoot: root, cwd: appDir }).run({
      appName: "demo",
      workspaceRoot: root,
      repoName: "repo",
      generation: 0,
      needs: ["base"],
      changedFiles: [],
      pageKeys: null,
      optimizedFonts: null,
      cssAssets: null,
      artifactDir: path.join(appDir, ".akan/artifact"),
    });

    expect(result.errors.base).toContain('"./not-there" (apps/demo/page/_index.tsx:1:22)');
  }, 30_000);

  test("a worker that dies mid-batch keeps what each need reported, and fails only the needs it never reached", async () => {
    const { root } = track(await createTempApp("demo"));
    const appDir = path.join(root, "apps/demo");
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `const { generation } = JSON.parse(process.argv[2]);
const status = (phase, message) =>
  process.send({ type: "build-status", data: { generation, phase, ok: !message, files: [], message } });
status("ssr");
status("css", "css broke");
setTimeout(() => process.exit(1), 50);
`,
    );
    const result = await new BuildBatchRunner({ workspaceRoot: root, cwd: appDir }).run({
      appName: "demo",
      workspaceRoot: root,
      repoName: "repo",
      generation: 7,
      needs: ["ssr", "css", "pages"],
      changedFiles: [],
      pageKeys: null,
      optimizedFonts: null,
      cssAssets: null,
      artifactDir: path.join(appDir, ".akan/artifact"),
    });
    expect(result).toMatchObject({ crashed: true, crashedNeeds: ["pages"] });
    expect(result.errors.ssr).toBeUndefined();
    expect(result.errors.css).toBe("css broke");
    expect(result.errors.pages).toContain("exited with code 1");
  }, 30_000);
});

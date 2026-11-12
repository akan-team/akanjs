import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createTempApp, tempRoots, writeText } from "../test/testHelpers";
import type { BuildBatchMessage, BuildBatchRequest, BuildBatchResult } from "./buildBatchProtocol";
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

  test("releases a worker as soon as its result arrives, so one that holds its exit for that is not left waiting", async () => {
    const { root } = track(await createTempApp("demo"));
    const appDir = path.join(root, "apps/demo");
    const released = path.join(root, "released");
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `import fs from "node:fs";
const { generation } = JSON.parse(process.argv[2]);
process.once("disconnect", () => fs.writeFileSync(${JSON.stringify(released)}, ""));
process.send({ type: "build-batch-result", data: { generation, errors: {} } });
setTimeout(() => process.exit(1), 2_000).unref();
`,
    );
    const result = await new BuildBatchRunner({ workspaceRoot: root, cwd: appDir }).run({
      appName: "demo",
      workspaceRoot: root,
      repoName: "repo",
      generation: 3,
      needs: ["pages"],
      changedFiles: [],
      pageKeys: null,
      optimizedFonts: null,
      cssAssets: null,
      artifactDir: path.join(appDir, ".akan/artifact"),
    });
    expect(result).toEqual({ generation: 3, errors: {} });
    expect(await Bun.file(released).exists()).toBe(true);
  }, 30_000);

  test("uses the result of a worker the release never reaches without waiting out its bound, and leaves it dead", async () => {
    const { root } = track(await createTempApp("demo"));
    const appDir = path.join(root, "apps/demo");
    const sent = path.join(root, "sent");
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `import fs from "node:fs";
const { generation } = JSON.parse(process.argv[2]);
fs.writeFileSync(${JSON.stringify(sent)}, JSON.stringify({ pid: process.pid, at: Date.now() }));
process.send({ type: "build-batch-result", data: { generation, errors: {} } });
setTimeout(() => process.exit(0), 5_000);
`,
    );
    const result = await new BuildBatchRunner({ workspaceRoot: root, cwd: appDir }).run({
      appName: "demo",
      workspaceRoot: root,
      repoName: "repo",
      generation: 5,
      needs: ["pages"],
      changedFiles: [],
      pageKeys: null,
      optimizedFonts: null,
      cssAssets: null,
      artifactDir: path.join(appDir, ".akan/artifact"),
    });
    const returnedAt = Date.now();
    const worker = (await Bun.file(sent).json()) as { pid: number; at: number };
    expect(result).toEqual({ generation: 5, errors: {} });
    expect(returnedAt - worker.at).toBeLessThan(3_000);
    expect(() => process.kill(worker.pid, 0)).toThrow();
  }, 30_000);

  test("the build worker stays up after reporting its result until its runner releases it", async () => {
    const { root } = track(await createTempApp("demo", path.join(import.meta.dir, "..", "local")));
    const appDir = path.join(root, "apps/demo");
    const request = {
      appName: "demo",
      workspaceRoot: root,
      repoName: "repo",
      generation: 4,
      needs: [],
      changedFiles: [],
      pageKeys: [],
      optimizedFonts: null,
      cssAssets: null,
      artifactDir: path.join(appDir, ".akan/artifact"),
    } satisfies BuildBatchRequest;
    const { promise: reported, resolve: report } = Promise.withResolvers<BuildBatchResult>();
    const worker = Bun.spawn(["bun", path.join(import.meta.dir, "buildBatch.proc.ts"), JSON.stringify(request)], {
      cwd: appDir,
      stdio: ["ignore", "inherit", "inherit"],
      serialization: "advanced",
      ipc: (message: BuildBatchMessage) => {
        if (message.type === "build-batch-result") report(message.data);
      },
    });
    expect(await reported).toEqual({ generation: 4, errors: {} });
    const unreleased = await Promise.race([worker.exited.then(() => "exited"), Bun.sleep(300).then(() => "running")]);
    worker.disconnect();
    expect(unreleased).toBe("running");
    expect(await worker.exited).toBe(0);
  }, 30_000);
});

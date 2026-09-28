import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { BuilderMessage, BuilderReq } from "akanjs/server";
import { createTempApp, tempRoots, writeText } from "../testHelpers";

const track = tempRoots();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const until = async (proc: Bun.Subprocess, what: string, condition: () => boolean) => {
  const deadline = Date.now() + 20_000;
  while (!condition()) {
    if (proc.exitCode !== null || Date.now() > deadline) throw new Error(`the builder never sent ${what}`);
    await wait(20);
  }
};

describe("incremental builder process", () => {
  test("says why and where a route's client bundle failed, in its answer, its build status and its log", async () => {
    const { root } = track(await createTempApp("demo"));
    const appDir = path.join(root, "apps/demo");
    // The batch runner looks under the workspace root first: a stand-in for the boot build, which needs a whole app.
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `const { generation } = JSON.parse(process.argv[2]);
process.send({ type: "build-batch-result", data: { generation, errors: {}, artifact: {}, optimizedFonts: { css: "", files: [] } } });
`,
    );
    const page = path.join(appDir, "page/_index.tsx");
    await writeText(page, 'import { Broken } from "../ui/Broken";\nexport default Broken;\n');
    await writeText(
      path.join(appDir, "ui/Broken.tsx"),
      '"use client";\nimport { gone } from "./not-there";\nexport const Broken = () => gone;\n',
    );

    const messages: BuilderMessage[] = [];
    const proc = Bun.spawn(["bun", path.join(import.meta.dir, "incrementalBuilder.proc.ts")], {
      cwd: appDir,
      env: {
        ...process.env,
        AKAN_WORKSPACE_ROOT: root,
        AKAN_PUBLIC_APP_NAME: "demo",
        AKAN_PUBLIC_REPO_NAME: "repo",
        AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
        AKAN_PUBLIC_ENV: "local",
        AKAN_WATCH: "0",
      },
      stdio: ["ignore", "ignore", "pipe"],
      serialization: "advanced",
      ipc: (message: BuilderMessage) => {
        messages.push(message);
      },
    });
    try {
      await until(proc, "builder-ready", () => messages.some((message) => message.type === "builder-ready"));
      proc.send({
        type: "build-route",
        id: 1,
        routeId: "page:/",
        seeds: [page],
        knownEntries: [],
        generation: 3,
      } satisfies BuilderReq);
      await until(proc, "build-route-res", () => messages.some((message) => message.type === "build-route-res"));
    } finally {
      proc.kill();
    }
    const log = await new Response(proc.stderr).text();

    const reason = '"./not-there" (apps/demo/ui/Broken.tsx:2:22)';
    expect(messages.find((message) => message.type === "build-route-res")).toMatchObject({
      id: 1,
      ok: false,
      error: expect.stringContaining(reason),
    });
    expect(messages.find((message) => message.type === "build-status")).toMatchObject({
      data: { generation: 3, phase: "route", ok: false, message: expect.stringContaining(reason) },
    });
    expect(log).toContain(reason);
  }, 30_000);

  test("a registry build whose worker was killed is built again once the crash window closes, for the route that asked", async () => {
    // Inside the checkout so the route's client bundle resolves the framework from its source.
    const { root } = track(await createTempApp("demo", path.join(import.meta.dir, "..", "local")));
    const appDir = path.join(root, "apps/demo");
    const runs = path.join(root, "ssr-runs.log");
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `import fs from "node:fs";
const { generation, needs } = JSON.parse(process.argv[2]);
if (needs.includes("ssr")) {
  fs.appendFileSync(${JSON.stringify(runs)}, "ssr\\n");
  if (fs.readFileSync(${JSON.stringify(runs)}, "utf8").split("\\n").length === 2) process.exit(1);
}
process.send({ type: "build-batch-result", data: { generation, errors: {}, artifact: {}, optimizedFonts: { css: "", files: [] } } });
`,
    );
    const page = path.join(appDir, "page/_index.tsx");
    await writeText(page, 'import { Card } from "../ui/Card";\nexport default Card;\n');
    await writeText(path.join(appDir, "ui/Card.tsx"), '"use client";\nexport const Card = () => null;\n');

    const messages: BuilderMessage[] = [];
    const proc = Bun.spawn(["bun", path.join(import.meta.dir, "incrementalBuilder.proc.ts")], {
      cwd: appDir,
      env: {
        ...process.env,
        AKAN_WORKSPACE_ROOT: root,
        AKAN_PUBLIC_APP_NAME: "demo",
        AKAN_PUBLIC_REPO_NAME: "repo",
        AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
        AKAN_PUBLIC_ENV: "local",
        AKAN_WATCH: "0",
      },
      stdio: ["ignore", "ignore", "ignore"],
      serialization: "advanced",
      ipc: (message: BuilderMessage) => {
        messages.push(message);
      },
    });
    const ssrRuns = async () =>
      (await Bun.file(runs).exists()) ? (await Bun.file(runs).text()).trim().split("\n") : [];
    try {
      await until(proc, "boot-armed", () => messages.some((message) => message.type === "boot-armed"));
      expect(await ssrRuns()).toHaveLength(1);
      proc.send({
        type: "build-route",
        id: 1,
        routeId: "page:/",
        seeds: [page],
        knownEntries: [],
        generation: 3,
      } satisfies BuilderReq);
      await until(proc, "build-route-res", () => messages.some((message) => message.type === "build-route-res"));
      expect(messages.find((message) => message.type === "build-route-res")).toMatchObject({ ok: true });
      expect(await ssrRuns()).toHaveLength(1);
      const deadline = Date.now() + 15_000;
      while ((await ssrRuns()).length < 2 && Date.now() < deadline) await wait(100);
      expect(await ssrRuns()).toHaveLength(2);
    } finally {
      proc.kill();
    }
  }, 40_000);

  test("a route build's registry check that has nothing to add reports no ssr status, so it cannot hide a failure", async () => {
    const { root } = track(await createTempApp("demo", path.join(import.meta.dir, "..", "local")));
    const appDir = path.join(root, "apps/demo");
    // The registry's own build is the real worker's; the rest is stood in for, as a boot build needs a whole app.
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `const { generation, needs } = JSON.parse(process.argv[2]);
if (needs.includes("ssr")) await import(${JSON.stringify(path.join(import.meta.dir, "buildBatch.proc.ts"))});
else process.send({ type: "build-batch-result", data: { generation, errors: {}, artifact: {}, optimizedFonts: { css: "", files: [] } } });
`,
    );
    await writeText(path.join(appDir, "env/env.client.ts"), "export const env = {} as const;\n");
    const page = path.join(appDir, "page/_index.tsx");
    await writeText(page, 'import { Card } from "../ui/Card";\nexport default Card;\n');
    await writeText(path.join(appDir, "ui/Card.tsx"), '"use client";\nexport const Card = () => null;\n');

    const messages: BuilderMessage[] = [];
    const proc = Bun.spawn(["bun", path.join(import.meta.dir, "incrementalBuilder.proc.ts")], {
      cwd: appDir,
      env: {
        ...process.env,
        AKAN_WORKSPACE_ROOT: root,
        AKAN_PUBLIC_APP_NAME: "demo",
        AKAN_PUBLIC_REPO_NAME: "repo",
        AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
        AKAN_PUBLIC_ENV: "local",
        AKAN_WATCH: "0",
      },
      stdio: ["ignore", "ignore", "ignore"],
      serialization: "advanced",
      ipc: (message: BuilderMessage) => {
        messages.push(message);
      },
    });
    const ssrStatuses = () =>
      messages.filter((message) => message.type === "build-status" && message.data.phase === "ssr");
    try {
      await until(proc, "boot-armed", () => messages.some((message) => message.type === "boot-armed"));
      expect(messages.some((message) => message.type === "ssr-updated")).toBe(true);
      const before = ssrStatuses().length;
      proc.send({
        type: "build-route",
        id: 1,
        routeId: "page:/",
        seeds: [page],
        knownEntries: [],
        generation: 3,
      } satisfies BuilderReq);
      await until(proc, "build-route-res", () => messages.some((message) => message.type === "build-route-res"));
      expect(messages.find((message) => message.type === "build-route-res")).toMatchObject({ ok: true });
      await wait(200);
      expect(ssrStatuses().length).toBe(before);
    } finally {
      proc.kill();
    }
  }, 60_000);
});

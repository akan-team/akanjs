import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { BuilderMessage, BuilderReq } from "akanjs/server";
import { createTempApp, tempRoots, writeText } from "../testHelpers";

const track = tempRoots();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const until = async (proc: Bun.Subprocess, what: string, condition: () => boolean, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (proc.exitCode !== null || Date.now() > deadline) throw new Error(`the builder never sent ${what}`);
    await wait(20);
  }
};

describe("incremental builder process", () => {
  test("says why and where a route's client bundle failed, in its answer, its build status and its log, at the builder's generation", async () => {
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
        AKAN_BUILDER_INITIAL_GENERATION: "5",
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
      //? Windows refuses to remove a directory a live process has as its cwd.
      await proc.exited;
    }
    const log = await new Response(proc.stderr).text();

    const reason = '"./not-there" (apps/demo/ui/Broken.tsx:2:22)';
    expect(messages.find((message) => message.type === "build-route-res")).toMatchObject({
      id: 1,
      ok: false,
      error: expect.stringContaining(reason),
    });
    expect(messages.find((message) => message.type === "build-status")).toMatchObject({
      data: { generation: 6, phase: "route", ok: false, message: expect.stringContaining(reason), scope: "page:/" },
    });
    expect(log).toContain(reason);
  }, 30_000);

  test("builds a view's shell once on request, answers with its failure, and reports it to no tab", async () => {
    const { root } = track(await createTempApp("demo"));
    const appDir = path.join(root, "apps/demo");
    // A stand-in batch: boots, and fails a shell batch by naming the needs it was handed.
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `const { generation, needs } = JSON.parse(process.argv[2]);
const errors = needs.includes("base") ? {} : { shell: "handed " + needs.join(",") };
process.send({ type: "build-batch-result", data: { generation, errors, artifact: {}, optimizedFonts: { css: "", files: [] } } });
`,
    );
    await writeText(path.join(appDir, "page/_index.tsx"), "export default () => null;\n");
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
      proc.send({ type: "build-csr", id: 7, reason: "mcp app view", shell: true } satisfies BuilderMessage);
      await until(proc, "build-csr-res", () => messages.some((message) => message.type === "build-csr-res"));
    } finally {
      proc.kill();
      await proc.exited;
    }
    expect(messages.find((message) => message.type === "build-csr-res")).toEqual({
      type: "build-csr-res",
      id: 7,
      ok: false,
      error: "handed shell",
    });
    expect(messages.some((message) => message.type === "build-status")).toBe(false);
  }, 30_000);

  test("answers a second shell request in the same generation without building again", async () => {
    const { root } = track(await createTempApp("demo"));
    const appDir = path.join(root, "apps/demo");
    const ledger = path.join(root, "batches.log");
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `const { generation, needs } = JSON.parse(process.argv[2]);
require("node:fs").appendFileSync(${JSON.stringify(ledger)}, needs.join(",") + "\\n");
process.send({ type: "build-batch-result", data: { generation, errors: {}, artifact: {}, optimizedFonts: { css: "", files: [] } } });
`,
    );
    await writeText(path.join(appDir, "page/_index.tsx"), "export default () => null;\n");
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
    const answers = () => messages.filter((message) => message.type === "build-csr-res");
    try {
      await until(proc, "builder-ready", () => messages.some((message) => message.type === "builder-ready"));
      proc.send({ type: "build-csr", id: 7, reason: "mcp app view", shell: true } satisfies BuilderMessage);
      await until(proc, "the first build-csr-res", () => answers().length === 1);
      proc.send({ type: "build-csr", id: 8, reason: "mcp app view", shell: true } satisfies BuilderMessage);
      await until(proc, "the second build-csr-res", () => answers().length === 2);
    } finally {
      proc.kill();
      await proc.exited;
    }
    expect(answers()).toEqual([
      { type: "build-csr-res", id: 7, ok: true },
      { type: "build-csr-res", id: 8, ok: true },
    ]);
    const batches = (await Bun.file(ledger).text()).trim().split("\n");
    expect(batches.filter((needs) => needs === "shell")).toHaveLength(1);
  }, 30_000);

  test("builds the shell again once the css it inlined is replaced, though the generation has not moved", async () => {
    const { root } = track(await createTempApp("demo"));
    const appDir = path.join(root, "apps/demo");
    const ledger = path.join(root, "batches.log");
    const gate = path.join(root, "css-lands");
    const landed = { "": { cssUrl: "/_akan/styles/root-next.css", cssRelPath: "styles/root-next.css" } };
    // The registry's boot build stands in for a save's css compile, held until the first shell is built.
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `import fs from "node:fs";
const { generation, needs, cssAssets } = JSON.parse(process.argv[2]);
fs.appendFileSync(${JSON.stringify(ledger)}, needs.join(",") + " " + JSON.stringify(cssAssets) + "\\n");
const orphaned = () => process.exit(1);
process.on("disconnect", orphaned);
const deadline = Date.now() + 15_000;
if (needs.includes("ssr")) while (!fs.existsSync(${JSON.stringify(gate)}) && Date.now() < deadline) await Bun.sleep(20);
const css = needs.includes("ssr") ? { cssAssets: ${JSON.stringify(landed)} } : {};
process.send({ type: "build-batch-result", data: { generation, errors: {}, artifact: {}, optimizedFonts: { css: "", files: [] }, ...css } });
process.off("disconnect", orphaned);
`,
    );
    await writeText(path.join(appDir, "page/_index.tsx"), "export default () => null;\n");
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
        AKAN_DEV_CSR_PATCHER: "off",
      },
      stdio: ["ignore", "ignore", "pipe"],
      serialization: "advanced",
      ipc: (message: BuilderMessage) => {
        messages.push(message);
      },
    });
    const answers = () => messages.filter((message) => message.type === "build-csr-res");
    try {
      await until(proc, "builder-ready", () => messages.some((message) => message.type === "builder-ready"));
      proc.send({ type: "build-csr", id: 7, reason: "mcp app view", shell: true } satisfies BuilderMessage);
      await until(proc, "the first build-csr-res", () => answers().length === 1);
      await writeText(gate, "");
      await until(proc, "boot-armed", () => messages.some((message) => message.type === "boot-armed"));
      proc.send({ type: "build-csr", id: 8, reason: "mcp app view", shell: true } satisfies BuilderMessage);
      await until(proc, "the second build-csr-res", () => answers().length === 2);
    } finally {
      await writeText(gate, "");
      proc.kill();
      await proc.exited;
    }
    expect(answers()).toEqual([
      { type: "build-csr-res", id: 7, ok: true },
      { type: "build-csr-res", id: 8, ok: true },
    ]);
    const shells = (await Bun.file(ledger).text()).split("\n").filter((line) => line.startsWith("shell "));
    expect(shells).toEqual(["shell null", `shell ${JSON.stringify(landed)}`]);
  }, 30_000);

  test("a killed boot build is tried again after the crash window, before boot-armed; a route build's check waits likewise", async () => {
    // Inside the checkout so the route's client bundle resolves the framework from its source.
    const { root } = track(await createTempApp("demo", path.join(import.meta.dir, "..", "local")));
    const appDir = path.join(root, "apps/demo");
    const runs = path.join(root, "ssr-runs.log");
    // The first two registry builds are killed (the boot build and its retry), the third succeeds.
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `import fs from "node:fs";
const { generation, needs } = JSON.parse(process.argv[2]);
if (needs.includes("ssr")) {
  fs.appendFileSync(${JSON.stringify(runs)}, Date.now() + "\\n");
  if (fs.readFileSync(${JSON.stringify(runs)}, "utf8").trim().split("\\n").length <= 2) process.exit(1);
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
      (await Bun.file(runs).exists()) ? (await Bun.file(runs).text()).trim().split("\n").map(Number) : [];
    try {
      //? boot-armed waits out the 10s crash window first, so 20s left a loaded machine too little for the rest.
      await until(proc, "boot-armed", () => messages.some((message) => message.type === "boot-armed"), 30_000);
      const [first = 0, second = 0] = await ssrRuns();
      expect(await ssrRuns()).toHaveLength(2);
      expect(second - first).toBeGreaterThanOrEqual(9_500);
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
      const deadline = Date.now() + 15_000;
      while ((await ssrRuns()).length < 3 && Date.now() < deadline) await wait(100);
      const [, retried = 0, third = 0] = await ssrRuns();
      expect(third - retried).toBeGreaterThanOrEqual(9_500);
    } finally {
      proc.kill();
      await proc.exited;
    }
  }, 60_000);

  test("a route build's check whose own worker is killed is tried again after the crash window", async () => {
    const { root } = track(await createTempApp("demo", path.join(import.meta.dir, "..", "local")));
    const appDir = path.join(root, "apps/demo");
    const runs = path.join(root, "ssr-runs.log");
    // The boot build succeeds, the route check's worker is killed, and the retry after the window succeeds.
    await writeText(
      path.join(root, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      `import fs from "node:fs";
const { generation, needs } = JSON.parse(process.argv[2]);
if (needs.includes("ssr")) {
  fs.appendFileSync(${JSON.stringify(runs)}, Date.now() + "\\n");
  if (fs.readFileSync(${JSON.stringify(runs)}, "utf8").trim().split("\\n").length === 2) process.exit(1);
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
      (await Bun.file(runs).exists()) ? (await Bun.file(runs).text()).trim().split("\n").map(Number) : [];
    try {
      await until(proc, "boot-armed", () => messages.some((message) => message.type === "boot-armed"));
      proc.send({
        type: "build-route",
        id: 1,
        routeId: "page:/",
        seeds: [page],
        knownEntries: [],
        generation: 3,
      } satisfies BuilderReq);
      await until(proc, "build-route-res", () => messages.some((message) => message.type === "build-route-res"));
      const deadline = Date.now() + 20_000;
      while ((await ssrRuns()).length < 3 && Date.now() < deadline) await wait(100);
      const [, killed = 0, retried = 0] = await ssrRuns();
      expect(retried - killed).toBeGreaterThanOrEqual(9_500);
    } finally {
      proc.kill();
      await proc.exited;
    }
  }, 60_000);

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
      await proc.exited;
    }
  }, 60_000);
});

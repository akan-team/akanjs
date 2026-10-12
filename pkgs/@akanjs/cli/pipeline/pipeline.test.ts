import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { lstat, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeCliTempWorkspace, tempRoots, writeText } from "@akanjs/devkit/testHelpers";
import { PipelinePlanSchema } from "akanjs/common";

//? Each case boots the CLI from source in a fresh process.
setDefaultTimeout(60_000);

const cliEntry = path.resolve(import.meta.dir, "../index.ts");
const track = tempRoots();

const workspaceWith = async (files: Record<string, string>) => {
  const { root } = track(await makeCliTempWorkspace());
  const scaffold = { "package.json": '{ "name": "repo", "version": "1.0.0" }\n', "tsconfig.json": "{}\n" };
  for (const [relative, content] of Object.entries({ ...scaffold, ...files }))
    await writeText(path.join(root, relative), content);
  return root;
};

const cli = async (cwd: string, args: string[]) => {
  const proc = Bun.spawn(["bun", cliEntry, "pipeline", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

const runFlags = [
  "--branch",
  "main",
  "--apps",
  "web,api",
  "--trigger",
  "push",
  "--build-num",
  "3",
  "--commit",
  "abc123",
];

const typeOnlyApp = `import type { AppConfig } from "akanjs";

const config: AppConfig = {
  pipeline: { stages: [{ use: "build" }, { name: "Test", sh: "bun test" }, { use: "docker" }, { use: "deploy" }] },
};

export default config;
`;

const rootConfig = `import type { WorkspaceConfig } from "akanjs";

export default {
  pipeline: { post: { failure: [{ name: "Notify", sh: "./notify.sh", secrets: ["DISCORD_WEBHOOK"] }] } },
} satisfies WorkspaceConfig;
`;

describe("akan pipeline", () => {
  test("plan writes the envelope, echoes the context and exits 0, from type-only configs with no node_modules", async () => {
    const root = await workspaceWith({
      "akan.config.ts": rootConfig,
      "apps/web/akan.config.ts": typeOnlyApp,
      "apps/api/akan.config.ts": "export default {};\n",
    });
    const out = path.join(root, ".akan-ci/plan.json");
    const { code, stderr } = await cli(root, ["plan", "--out", out, ...runFlags]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    const result = PipelinePlanSchema.parseText(await readFile(out, "utf8"));
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.plan.context).toEqual({
      branch: "main",
      env: "main",
      apps: ["web", "api"],
      trigger: "push",
      buildNum: 3,
      commit: "abc123",
    });
    expect(result.plan.phases.map((phase) => phase.id)).toEqual(["build", "after-build", "docker", "deploy"]);
    expect(result.plan.requiredSecrets).toEqual(["DISCORD_WEBHOOK"]);
  });

  test("a definition with errors still writes its envelope, and exits 1", async () => {
    const root = await workspaceWith({
      "apps/web/akan.config.ts": 'export default { pipeline: { stages: [{ use: "docker" }] } };\n',
      "apps/api/akan.config.ts": "export default {};\n",
    });
    const out = path.join(root, "plan.json");
    const { code } = await cli(root, ["plan", "--out", out, ...runFlags]);
    expect(code).toBe(1);
    const result = PipelinePlanSchema.parseText(await readFile(out, "utf8"));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("pipeline.action.dockerWithoutBuild");
  });

  test("anything else exits 2 and leaves no envelope", async () => {
    const root = await workspaceWith({ "apps/web/akan.config.ts": "export default {};\n" });
    const out = path.join(root, "plan.json");
    const { code, stderr } = await cli(root, ["plan", "--out", out, "--build-num", "1.5"]);
    expect(code).toBe(2);
    expect(stderr).toContain("--build-num");
    expect(await Bun.file(out).exists()).toBe(false);
  });

  test("a flag or argument the CLI refuses exits 2, not 1, and leaves no envelope", async () => {
    const root = await workspaceWith({ "apps/web/akan.config.ts": "export default {};\n" });
    const out = path.join(root, "plan.json");
    for (const [args, named] of [
      [["plan", "--trigger", "bogus"], "--trigger"],
      [["plan", "--unknown-flag"], "--unknown-flag"],
      [["bogus-action"], "bogus-action"],
    ] as const) {
      const { code, stdout, stderr } = await cli(root, [...args, "--out", out]);
      expect({ args, code }).toEqual({ args, code: 2 });
      expect(`${stdout}${stderr}`).toContain(named);
    }
    expect(await Bun.file(out).exists()).toBe(false);
  });

  test("a directory that is not a workspace root exits 2 and leaves no envelope", async () => {
    const root = await workspaceWith({ "apps/web/akan.config.ts": "export default {};\n" });
    await rm(path.join(root, ".env"));
    const out = path.join(root, "plan.json");
    const { code, stdout } = await cli(root, ["plan", "--out", out]);
    expect(code).toBe(2);
    expect(stdout).toContain("must be run from the workspace root");
    expect(await Bun.file(out).exists()).toBe(false);
  });

  test("a link already at --out is replaced, never followed", async () => {
    const root = await workspaceWith({ "apps/web/akan.config.ts": "export default {};\n" });
    const victim = path.join(root, "victim.txt");
    await writeFile(victim, "untouched\n");
    const out = path.join(root, "plan.json");
    await symlink(victim, out);
    const { code } = await cli(root, ["plan", "--out", out, "--apps", "web"]);
    expect(code).toBe(0);
    expect((await lstat(out)).isSymbolicLink()).toBe(false);
    expect(await readFile(victim, "utf8")).toBe("untouched\n");
  });

  test("ota packs every native target that takes updates, and refuses one that does not", async () => {
    const updates = `{ url: "https://cdn.example.com/ota", publicKey: "${Buffer.alloc(32, 7).toString("base64")}" }`;
    const root = await workspaceWith({
      "apps/web/akan.config.ts": `export default {
  native: { targets: { store: { updates: ${updates} }, kiosk: {} } },
  pipeline: { stages: [{ use: "build" }, { use: "ota", platforms: ["android"] }] },
};
`,
      "apps/api/akan.config.ts": `export default {
  native: { targets: { kiosk: {} } },
  pipeline: { stages: [{ use: "ota", targets: ["kiosk"] }] },
};
`,
    });
    const out = path.join(root, "plan.json");
    const both = await cli(root, ["plan", "--out", out, ...runFlags]);
    expect(both.code).toBe(1);
    const failed = PipelinePlanSchema.parseText(await readFile(out, "utf8"));
    expect(failed.diagnostics.map(({ code, file }) => [code, file])).toEqual([
      ["pipeline.ota.noUpdates", "apps/api/akan.config.ts"],
    ]);
    const web = await cli(root, ["plan", "--out", out, ...runFlags.slice(0, 2), "--apps", "web"]);
    expect({ code: web.code, stderr: web.stderr }).toEqual({ code: 0, stderr: "" });
    const result = PipelinePlanSchema.parseText(await readFile(out, "utf8"));
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.plan.phases.find((phase) => phase.id === "ota")?.stages[0]?.steps[0]).toMatchObject({
      action: "ota",
      with: { app: "web", targets: ["store"], platforms: ["android"] },
    });
    const dryRun = await cli(root, ["dry-run", "--apps", "web"]);
    expect(dryRun.stdout).toContain("web (store × android)");
  });

  test("dry-run shows the plan and validate names a sampled function form", async () => {
    const root = await workspaceWith({
      "apps/web/akan.config.ts":
        'export default { pipeline: (ctx) => ({ stages: [{ use: "build" }, { name: "Test " + ctx.app, sh: "bun test" }] }) };\n',
    });
    const dryRun = await cli(root, ["dry-run", "--branch", "develop", "--apps", "web"]);
    expect(dryRun.code).toBe(0);
    expect(dryRun.stdout).toContain("plan v1 · branch develop · env develop · trigger manual · apps web");
    expect(dryRun.stdout).toContain("web:Test web");
    const validate = await cli(root, ["validate", "--apps", "web"]);
    expect(validate.code).toBe(0);
    expect(validate.stdout).toContain("valid: 2 phases, 2 stages");
    expect(validate.stdout).toContain("warning pipeline.function.sampled");
  });
});

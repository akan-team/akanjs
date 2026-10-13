import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WorkspaceExecutor } from "../executors";
import { PipelineDefinition } from "./PipelineDefinition";

const context = {
  branch: "main",
  env: "main",
  apps: ["web", "api"],
  trigger: "push",
  buildNum: 1,
  commit: null,
} as const;

const withWorkspace = async (files: Record<string, string>, run: (workspace: WorkspaceExecutor) => Promise<void>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-plan-definition-"));
  try {
    for (const [relative, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), content);
    }
    await run(WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: "repo" }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const webConfig = `import type { AppConfig } from "akanjs";

const config: AppConfig = {
  externalLibs: ["shiki"],
  pipeline: { stages: [{ use: "build" }, { name: "Test", sh: "bun test" }, { use: "docker" }, { use: "deploy" }] },
};

export default config;
`;

describe("PipelineDefinition", () => {
  test("reads the root config and each app's, type-only imports with no node_modules at all", async () => {
    await withWorkspace(
      {
        "akan.config.ts":
          'import type { WorkspaceConfig } from "akanjs";\n\nexport default { pipeline: { before: [{ name: "Lint", sh: "bun lint" }] } } satisfies WorkspaceConfig;\n',
        "apps/web/akan.config.ts": webConfig,
        "apps/api/akan.config.ts": "export default (app) => ({ externalLibs: [app.name] });\n",
      },
      async (workspace) => {
        const definition = await PipelineDefinition.load(workspace, context.apps);
        const result = definition.compile({ ...context, apps: [...context.apps] });
        if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
        expect(result.plan.phases.map((phase) => phase.id)).toEqual([
          "lint",
          "build",
          "after-build",
          "docker",
          "deploy",
        ]);
        expect(result.plan.sources.workspace?.declared).toBe(true);
        expect(result.plan.sources.apps.web).toEqual({
          file: "apps/web/akan.config.ts",
          sha256: createHash("sha256").update(webConfig).digest("hex"),
          declared: true,
        });
        expect(result.plan.sources.apps.api?.declared).toBe(false);
        expect(definition.workspaceApps).toEqual(["api", "web"]);
      },
    );
  });

  test("the workspace's apps are in code-point order, whatever the machine's locale", async () => {
    await withWorkspace(
      { "apps/api/akan.config.ts": "export default {};\n", "apps/Web/akan.config.ts": "export default {};\n" },
      async (workspace) => {
        expect((await PipelineDefinition.load(workspace, [])).workspaceApps).toEqual(["Web", "api"]);
      },
    );
  });

  test("a config that cannot load is an error naming the file, never a silent default", async () => {
    await withWorkspace(
      {
        "apps/web/akan.config.ts": 'throw new Error("boom");\n',
        "apps/api/akan.config.ts": "export default {};\n",
      },
      async (workspace) => {
        const result = (await PipelineDefinition.load(workspace, context.apps)).compile({
          ...context,
          apps: [...context.apps],
        });
        expect(result.ok).toBe(false);
        expect(result.diagnostics[0]).toMatchObject({ code: "pipeline.load.failed", file: "apps/web/akan.config.ts" });
      },
    );
  });
});

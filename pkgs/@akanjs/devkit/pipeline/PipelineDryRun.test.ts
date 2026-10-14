import { describe, expect, test } from "bun:test";
import type { PipelinePlanContext } from "akanjs/common";
import { PipelineCompiler } from "./PipelineCompiler";
import { PipelineDryRun } from "./PipelineDryRun";

const sha = "0".repeat(64);
const context: PipelinePlanContext = {
  branch: "develop",
  env: "develop",
  apps: ["web", "api"],
  trigger: "push",
  buildNum: 3,
  commit: null,
};

describe("PipelineDryRun", () => {
  test("shows each phase in run order, with skips, allowed failures and the executor's own work", () => {
    const result = PipelineCompiler.compile({
      context,
      workspaceApps: ["api", "web"],
      workspace: {
        file: "akan.config.ts",
        sha256: sha,
        pipeline: {
          before: [
            {
              name: "Checks",
              parallel: [
                { name: "Lint", sh: "bun lint" },
                { name: "Test", sh: "bun test" },
              ],
            },
          ],
          post: { failure: [{ name: "Notify", sh: "./notify.sh", secrets: ["DISCORD_WEBHOOK"] }] },
        },
      },
      apps: new Map([
        [
          "web",
          {
            file: "apps/web/akan.config.ts",
            sha256: sha,
            pipeline: {
              after: ["api"],
              stages: [
                { use: "build" },
                { name: "Test", sh: "bun run akan test web" },
                { use: "docker" },
                { use: "deploy", when: { branch: "main" } },
                { name: "Smoke", sh: "curl -fsS https://web.example.com/api/ping", allowFailure: true },
              ],
            },
          },
        ],
        ["api", { file: "apps/api/akan.config.ts", sha256: sha, pipeline: null }],
      ]),
      akanVersion: "3.0.3",
    });
    expect(PipelineDryRun.render(result)).toBe(
      [
        "plan v1 · branch develop · env develop · trigger push · apps web, api · order api → web",
        "from akan.config.ts, apps/web/akan.config.ts, apps/api/akan.config.ts (default)",
        "",
        "prepare  (executor)                  checkout · env · install · plan",
        "prepare  checks        Checks        ‖ Lint · Test",
        "build    build         Build         ‖ api · web",
        "verify   after-build   After build   web:Test  bun run akan test web",
        "package  docker        Docker        ‖ api · web",
        'deploy   deploy        Deploy        → api, web (skipped: branch "develop" does not match "main") (one at a time)',
        "deploy   after-deploy  After deploy  web:Smoke (may fail)  curl -fsS https://web.example.com/api/ping",
        "finish   post.failure                Notify",
        "finish   (executor)                  cleanup",
        "",
        "secrets required: DISCORD_WEBHOOK",
      ].join("\n"),
    );
  });

  test("a phase of one stage still names its app", () => {
    const result = PipelineCompiler.compile({
      context: { ...context, apps: ["web"] },
      workspaceApps: ["web"],
      workspace: {
        file: "akan.config.ts",
        sha256: sha,
        pipeline: { after: [{ name: "E2E", matrix: "apps", sh: "bun run e2e" }] },
      },
      apps: new Map([["web", { file: "apps/web/akan.config.ts", sha256: sha, pipeline: null }]]),
      akanVersion: "3.0.3",
    });
    expect(PipelineDryRun.render(result)).toBe(
      [
        "plan v1 · branch develop · env develop · trigger push · apps web",
        "from akan.config.ts, apps/web/akan.config.ts (default)",
        "",
        "prepare  (executor)          checkout · env · install · plan",
        "build    build       Build   web  action build",
        "package  docker      Docker  web  action docker",
        "deploy   deploy      Deploy  → web (one at a time)",
        "finish   e2e         E2E     web  bun run e2e",
        "finish   (executor)          cleanup",
      ].join("\n"),
    );
  });

  test("a failed plan prints its diagnostics", () => {
    const rendered = PipelineDryRun.render({
      ok: false,
      plan: null,
      diagnostics: [
        { severity: "error", code: "pipeline.action.order", message: "x", file: "apps/web/akan.config.ts", path: "p" },
      ],
    });
    expect(rendered).toBe(
      ["no plan: the definition has errors", "", "error pipeline.action.order (apps/web/akan.config.ts · p): x"].join(
        "\n",
      ),
    );
  });
});

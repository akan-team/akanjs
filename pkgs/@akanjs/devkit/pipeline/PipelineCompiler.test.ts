import { describe, expect, test } from "bun:test";
import type { AppPipelineConfig, WorkspacePipelineConfig } from "akanjs";
import type { PipelinePlan, PipelinePlanContext, PipelinePlanResult } from "akanjs/common";
import { type PipelineCompileInput, PipelineCompiler, type PipelineSourceFile } from "./PipelineCompiler";

const sha = "0".repeat(64);
const context = (overrides: Partial<PipelinePlanContext> = {}): PipelinePlanContext => ({
  branch: "main",
  env: "main",
  apps: ["api", "web"],
  trigger: "push",
  buildNum: 12,
  commit: "5ab138a1",
  ...overrides,
});

const appSource = (app: string, pipeline: AppPipelineConfig | null = null): PipelineSourceFile<AppPipelineConfig> => ({
  file: `apps/${app}/akan.config.ts`,
  sha256: sha,
  pipeline,
});

const compile = ({
  apps = {},
  workspace,
  ctx = context(),
  workspaceApps = ["api", "edge", "web"],
  sampled,
}: {
  apps?: Record<string, AppPipelineConfig | null>;
  workspace?: WorkspacePipelineConfig | null;
  ctx?: PipelinePlanContext;
  workspaceApps?: string[];
  sampled?: boolean;
} = {}): PipelinePlanResult => {
  const input: PipelineCompileInput = {
    context: ctx,
    workspaceApps,
    workspace: workspace === undefined ? null : { file: "akan.config.ts", sha256: sha, pipeline: workspace },
    apps: new Map(ctx.apps.map((app) => [app, appSource(app, apps[app] ?? null)])),
    akanVersion: "3.0.3",
    sampled,
  };
  return PipelineCompiler.compile(input);
};

const planOf = (result: PipelinePlanResult): PipelinePlan => {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics, null, 2));
  return result.plan;
};

const codes = (result: PipelinePlanResult) => result.diagnostics.map((diagnostic) => diagnostic.code);

const phaseIds = (plan: PipelinePlan) => plan.phases.map((phase) => phase.id);

describe("PipelineCompiler", () => {
  test("zero-config: build, docker and deploy, deploy one app at a time in the given order", () => {
    const plan = planOf(compile());
    const actionStage = (app: string, action: "build" | "docker" | "deploy", milestone: string, step: string) => ({
      id: `${app}:${action}`,
      name: app,
      description: null,
      app,
      milestone,
      skip: null,
      runtimeWhen: null,
      allowFailure: false,
      timeoutSeconds: null,
      steps: [
        {
          id: `${app}:${action}/${action}`,
          name: `${step} ${app}`,
          timeoutSeconds: null,
          retry: null,
          allowFailure: false,
          kind: "action",
          action,
          actionVersion: 1,
          with: { app },
        },
      ],
    });
    const actionPhase = (action: "build" | "docker" | "deploy", name: string, milestone: string, step: string) => ({
      id: action,
      name,
      description: null,
      slot: action,
      milestone,
      action,
      order: action === "deploy" ? "sequential" : "parallel",
      maxParallel: null,
      failFast: false,
      timeoutSeconds: null,
      stages: ["api", "web"].map((app) => actionStage(app, action, milestone, step)),
    });
    expect(plan).toEqual({
      schemaVersion: 1,
      sources: {
        workspace: null,
        apps: {
          api: { file: "apps/api/akan.config.ts", sha256: sha, declared: false },
          web: { file: "apps/web/akan.config.ts", sha256: sha, declared: false },
        },
      },
      planner: { akanVersion: "3.0.3" },
      context: context(),
      appOrder: ["api", "web"],
      timeoutSeconds: null,
      requiredSecrets: [],
      phases: [
        actionPhase("build", "Build", "build", "akan build"),
        actionPhase("docker", "Docker", "package", "image"),
        actionPhase("deploy", "Deploy", "deploy", "deploy"),
      ],
      post: { success: [], failure: [], canceled: [], always: [] },
    } as PipelinePlan);
  });

  test("a root config holding no pipeline still plans as zero-config, and says the file was read", () => {
    const plan = planOf(compile({ workspace: null }));
    expect(phaseIds(plan)).toEqual(["build", "docker", "deploy"]);
    expect(plan.sources.workspace).toEqual({ file: "akan.config.ts", sha256: sha, declared: false });
  });

  test("the akanjs repo's Jenkinsfile, split into a root config and the app's own stages", () => {
    const notify = (result: string) => ({ name: `Discord: ${result}`, sh: "curl …", secrets: ["DISCORD_WEBHOOK"] });
    const plan = planOf(
      compile({
        ctx: context({ apps: ["akan"] }),
        workspaceApps: ["akan"],
        workspace: {
          before: [
            { name: "Notify start", steps: [notify("Build Start")] },
            { name: "Build framework", sh: "bun run buildAkan" },
            { name: "Typecheck", sh: "bun run typecheckPkgs" },
            { name: "Test", sh: "bun run testPkgs" },
          ],
          after: [
            { name: "Dev stability", sh: "bun run testDevStability", timeout: "45m", allowFailure: true },
            {
              name: "Dev registry E2E",
              timeout: "20m",
              allowFailure: true,
              steps: [{ sh: "bun run testDevRegistryE2e", skipExitCodes: [3] }],
            },
          ],
          post: { success: [notify("Build Succeed")], failure: [notify("Build Failed")] },
        },
        apps: {
          akan: {
            stages: [
              { name: "Docs search", sh: "bun run runAkan script akan generateDocsSearch" },
              { use: "build" },
              { use: "docker" },
              { use: "deploy" },
            ],
          },
        },
      }),
    );
    expect(phaseIds(plan)).toEqual([
      "notify-start",
      "build-framework",
      "typecheck",
      "test",
      "before-build",
      "build",
      "docker",
      "deploy",
      "dev-stability",
      "dev-registry-e2e",
    ]);
    expect(plan.phases.map((phase) => phase.milestone)).toEqual([
      "prepare",
      "prepare",
      "prepare",
      "prepare",
      "prepare",
      "build",
      "package",
      "deploy",
      "finish",
      "finish",
    ]);
    const e2e = plan.phases.at(-1)?.stages[0];
    expect(e2e).toMatchObject({ id: "dev-registry-e2e", allowFailure: true, timeoutSeconds: 1200 });
    expect(e2e?.steps[0]).toMatchObject({
      id: "dev-registry-e2e/1",
      skipExitCodes: [3],
      name: "bun run testDevRegistryE2e",
    });
    expect(plan.post.success.map((step) => step.id)).toEqual(["post.success/discord-build-succeed"]);
    expect(plan.requiredSecrets).toEqual(["DISCORD_WEBHOOK"]);
    expect(plan.sources.apps).toMatchObject({ akan: { declared: true } });
    expect(plan.sources.workspace?.declared).toBe(true);
  });

  test("app stages fill the slots around the actions, the k-th of every app sharing one phase", () => {
    const plan = planOf(
      compile({
        apps: {
          web: {
            stages: [
              { use: "build" },
              { name: "Test", sh: "bun test" },
              { name: "Lint", sh: "bun lint" },
              { use: "docker" },
              { use: "deploy" },
              { name: "Smoke", sh: "curl -fsS https://web.example.com/api/ping" },
            ],
          },
          api: { stages: [{ use: "build" }, { name: "Typecheck", sh: "tsc" }, { use: "docker" }, { use: "deploy" }] },
        },
      }),
    );
    expect(phaseIds(plan)).toEqual(["build", "after-build", "after-build-2", "docker", "deploy", "after-deploy"]);
    const stagesOf = (id: string) => plan.phases.find((phase) => phase.id === id)?.stages.map((stage) => stage.id);
    expect(stagesOf("after-build")).toEqual(["api:typecheck", "web:test"]);
    expect(stagesOf("after-build-2")).toEqual(["web:lint"]);
    expect(stagesOf("after-deploy")).toEqual(["web:smoke"]);
    expect(plan.phases.find((phase) => phase.id === "after-build-2")).toMatchObject({
      name: "After build 2",
      milestone: "verify",
    });
    expect(plan.phases.find((phase) => phase.id === "after-deploy")?.stages[0]?.milestone).toBe("deploy");
  });

  test("`after` orders the apps where they run one at a time, ties keeping the given order", () => {
    const plan = planOf(
      compile({
        ctx: context({ apps: ["web", "edge", "api"] }),
        apps: { web: { stages: [{ use: "build" }, { use: "docker" }, { use: "deploy" }], after: ["api", "absent"] } },
      }),
    );
    expect(plan.appOrder).toEqual(["edge", "api", "web"]);
    expect(plan.context.apps).toEqual(["web", "edge", "api"]);
    expect(plan.phases.find((phase) => phase.id === "deploy")?.stages.map((stage) => stage.app)).toEqual([
      "edge",
      "api",
      "web",
    ]);
  });

  test("an `after` cycle is an error naming the apps in it", () => {
    const result = compile({
      apps: {
        api: { stages: [{ use: "build" }], after: ["web"] },
        web: { stages: [{ use: "build" }], after: ["api"] },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === "pipeline.app.afterCycle")?.message).toContain(
      "api, web",
    );
  });

  test("a skipped action skips the app's later actions, with the reason why", () => {
    const plan = planOf(
      compile({
        ctx: context({ branch: "develop", env: "develop" }),
        apps: {
          web: { stages: [{ use: "build", when: { branch: "main" } }, { use: "docker" }, { use: "deploy" }] },
        },
      }),
    );
    const skipOf = (phase: string) =>
      plan.phases.find((each) => each.id === phase)?.stages.find((stage) => stage.app === "web")?.skip;
    expect(skipOf("build")).toEqual({ reason: 'branch "develop" does not match "main"' });
    expect(skipOf("docker")).toEqual({ reason: "build of web is skipped" });
    expect(skipOf("deploy")).toEqual({ reason: "docker of web is skipped" });
    expect(
      plan.phases.find((phase) => phase.id === "deploy")?.stages.find((stage) => stage.app === "api")?.skip,
    ).toBeNull();
  });

  test("allowed failures, milestones and runtime conditions are taken on actions too", () => {
    const plan = planOf(
      compile({
        apps: {
          web: {
            stages: [
              { use: "build", allowFailure: true, milestone: "verify", when: { changed: ["apps/web/**"] }, retry: 3 },
              { use: "docker" },
              { use: "deploy" },
            ],
          },
        },
      }),
    );
    const build = plan.phases[0]?.stages.find((stage) => stage.app === "web");
    expect(build).toMatchObject({ allowFailure: true, milestone: "verify", runtimeWhen: { changed: ["apps/web/**"] } });
    expect(build?.steps[0]?.retry).toEqual({ attempts: 3, delaySeconds: 0 });
  });

  test("a workspace matrix copies its stage per app, and a parallel stage hands its condition to each branch", () => {
    const plan = planOf(
      compile({
        ctx: context({ trigger: "redeploy" }),
        workspace: {
          before: [
            {
              name: "Checks",
              allowFailure: true,
              timeout: "10m",
              when: { trigger: "push" },
              parallel: [
                { name: "Lint", sh: "bun lint" },
                { name: "Test", sh: "bun test", timeout: 300 },
              ],
            },
          ],
          after: [
            {
              name: "E2E",
              matrix: "apps",
              sh: "bun run e2e $AKAN_CI_APP",
              when: { app: ["*", "!web"] },
              timeout: "1h",
            },
          ],
        },
      }),
    );
    const checks = plan.phases[0];
    expect(checks).toMatchObject({ id: "checks", timeoutSeconds: 600, milestone: "prepare" });
    expect(checks?.stages.map((stage) => [stage.id, stage.allowFailure, stage.timeoutSeconds, stage.skip])).toEqual([
      ["checks.lint", true, null, { reason: 'trigger "redeploy" is not "push"' }],
      ["checks.test", true, 300, { reason: 'trigger "redeploy" is not "push"' }],
    ]);
    const e2e = plan.phases.at(-1);
    expect(e2e).toMatchObject({ id: "e2e", timeoutSeconds: 3600, milestone: "finish" });
    expect(e2e?.stages.map((stage) => [stage.id, stage.name, stage.app])).toEqual([["e2e:api", "api", "api"]]);
  });

  test("env is workspace, then app, then stage, then step; secrets are each step's union", () => {
    const plan = planOf(
      compile({
        ctx: context({ apps: ["web"] }),
        workspace: { env: { LEVEL: "workspace", ROOT: "1" } },
        apps: {
          web: {
            env: { LEVEL: "app", APP: "1" },
            stages: [
              { use: "build" },
              {
                name: "Test",
                env: { LEVEL: "stage" },
                secrets: ["NPM_TOKEN"],
                steps: [{ sh: "bun test", env: { LEVEL: "step" }, secrets: ["CODECOV_TOKEN"] }],
              },
            ],
          },
        },
      }),
    );
    const step = plan.phases.find((phase) => phase.id === "after-build")?.stages[0]?.steps[0];
    expect(step).toMatchObject({
      env: { LEVEL: "step", ROOT: "1", APP: "1" },
      secrets: ["NPM_TOKEN", "CODECOV_TOKEN"],
    });
    expect(plan.requiredSecrets).toEqual(["CODECOV_TOKEN", "NPM_TOKEN"]);
  });

  test("function forms receive the run's context, the app's own included", () => {
    const seen: string[] = [];
    const plan = planOf(
      compile({
        ctx: context({ apps: ["web"] }),
        workspace: (ctx) => {
          seen.push(`workspace:${ctx.workspaceApps.join()}:${ctx.branch}`);
          return {};
        },
        apps: {
          web: (ctx) => {
            seen.push(`app:${ctx.app}:${ctx.apps.join()}`);
            return { stages: [{ use: "build" }] };
          },
        },
      }),
    );
    expect(seen).toEqual(["workspace:api,edge,web:main", "app:web:web"]);
    expect(phaseIds(plan)).toEqual(["build"]);
  });

  test("the plan is a pure function of its input", () => {
    const run = () =>
      JSON.stringify(
        compile({
          apps: { web: { stages: [{ use: "build" }, { name: "Test", sh: "x", secrets: ["B_TOKEN", "A_TOKEN"] }] } },
        }),
      );
    expect(run()).toBe(run());
  });

  test("the context is echoed, and an unknown or doubled app is refused rather than corrected", () => {
    expect(planOf(compile({ ctx: context({ apps: ["web", "api"] }) })).context.apps).toEqual(["web", "api"]);
    expect(codes(compile({ ctx: context({ apps: ["web", "web"] }) }))).toContain("pipeline.context.duplicateApp");
    expect(codes(compile({ ctx: context({ apps: ["ghost"] }) }))).toContain("pipeline.context.unknownApp");
  });

  describe("diagnostics", () => {
    const appResult = (pipeline: AppPipelineConfig) =>
      compile({ ctx: context({ apps: ["web"] }), apps: { web: pipeline } });

    test("action structure", () => {
      expect(codes(appResult({ stages: [{ use: "docker" }, { use: "deploy" }] }))).toContain(
        "pipeline.action.dockerWithoutBuild",
      );
      expect(codes(appResult({ stages: [{ use: "build" }, { use: "build" }] }))).toContain("pipeline.action.duplicate");
      expect(codes(appResult({ stages: [{ use: "build" }, { use: "deploy" }, { use: "docker" }] }))).toContain(
        "pipeline.action.order",
      );
      const deployOnly = appResult({ stages: [{ use: "build" }, { use: "deploy" }] });
      expect(deployOnly.ok).toBe(true);
      expect(codes(deployOnly)).toContain("pipeline.action.deployWithoutDocker");
      const noActions = appResult({ stages: [{ name: "Docs", sh: "bun docs" }] });
      expect(noActions.ok).toBe(true);
      expect(codes(noActions)).toContain("pipeline.app.noActions");
    });

    test("shape and names", () => {
      expect(codes(appResult({ stages: [{ name: "x", sh: "x", when: { app: "web" } } as never] }))).toContain(
        "pipeline.schema.unknownKey",
      );
      expect(codes(appResult({ stages: [{ name: "x", sh: "x", steps: ["y"] } as never] }))).toContain(
        "pipeline.schema.invalid",
      );
      expect(codes(appResult({ stages: [{ name: "x", sh: "x", cache: ["node_modules"] } as never] }))).toContain(
        "pipeline.schema.unsupported",
      );
      expect(codes(appResult({ stages: [{ name: "x", sh: "x", env: { PATH: "/bin" } }] }))).toContain(
        "pipeline.env.name",
      );
      expect(codes(appResult({ stages: [{ name: "x", sh: "x", secrets: ["lower"] }] }))).toContain(
        "pipeline.secret.name",
      );
      expect(codes(appResult({ stages: [{ name: "x", steps: [{ sh: "x", cwd: "../up" }] }] }))).toContain(
        "pipeline.cwd.outside",
      );
      expect(codes(appResult({ stages: [{ name: "x", sh: "x", timeout: "1.5h" as never }] }))).toContain(
        "pipeline.duration.invalid",
      );
      expect(codes(appResult({ stages: [{ name: "x", sh: "x", when: { branch: "{a,b}" } }] }))).toContain(
        "pipeline.when.pattern",
      );
      expect(
        codes(
          appResult({
            stages: [
              { name: "Test", sh: "a" },
              { name: "test", sh: "b" },
            ],
          }),
        ),
      ).toContain("pipeline.id.duplicate");
      expect(codes(appResult({ stages: [{ name: "!!!", sh: "a" }] }))).toContain("pipeline.id.invalid");
      expect(codes(appResult({ schemaVersion: 2 as never, stages: [] }))).toContain("pipeline.schema.unsupported");
    });

    test("the workspace scope", () => {
      expect(codes(compile({ workspace: { before: [{ use: "build" } as never] } }))).toContain(
        "pipeline.schema.invalid",
      );
      expect(codes(compile({ workspace: { before: [{ name: "Build", sh: "x" }] } }))).toContain("pipeline.id.reserved");
      expect(codes(compile({ workspace: { post: { unstable: ["x"] } as never } }))).toContain(
        "pipeline.schema.unknownKey",
      );
    });

    test("loading and sampling", () => {
      const thrown = appResult(() => {
        throw new Error("boom");
      });
      expect(thrown.ok).toBe(false);
      expect(thrown.diagnostics.find((diagnostic) => diagnostic.code === "pipeline.load.failed")?.message).toContain(
        "boom",
      );
      const sampled = compile({
        ctx: context({ apps: ["web"] }),
        apps: { web: () => ({ stages: [] }) },
        sampled: true,
      });
      expect(codes(sampled)).toContain("pipeline.function.sampled");
    });

    test("milestones that move backwards are a warning", () => {
      const result = appResult({
        stages: [{ use: "build" }, { use: "docker" }, { name: "Late", sh: "x", milestone: "verify" }],
      });
      expect(result.ok).toBe(true);
      expect(codes(result)).toContain("pipeline.milestone.backwards");
    });
  });
});

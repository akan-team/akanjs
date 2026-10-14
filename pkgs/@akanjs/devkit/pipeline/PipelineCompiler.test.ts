import { describe, expect, test } from "bun:test";
import type { AppPipelineConfig, WorkspacePipelineConfig } from "akanjs";
import type { PipelinePlan, PipelinePlanContext, PipelinePlanResult } from "akanjs/common";
import {
  type PipelineCompileInput,
  PipelineCompiler,
  type PipelineNativeTargets,
  type PipelineSourceFile,
} from "./PipelineCompiler";

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
  nativeTargets,
}: {
  apps?: Record<string, AppPipelineConfig | null>;
  workspace?: WorkspacePipelineConfig | null;
  ctx?: PipelinePlanContext;
  workspaceApps?: string[];
  sampled?: boolean;
  nativeTargets?: Record<string, PipelineNativeTargets>;
} = {}): PipelinePlanResult => {
  const input: PipelineCompileInput = {
    context: ctx,
    workspaceApps,
    workspace: workspace === undefined ? null : { file: "akan.config.ts", sha256: sha, pipeline: workspace },
    apps: new Map(ctx.apps.map((app) => [app, appSource(app, apps[app] ?? null)])),
    akanVersion: "3.0.3",
    sampled,
    nativeTargets: nativeTargets && new Map(Object.entries(nativeTargets)),
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
    expect(e2e?.stages.map((stage) => [stage.id, stage.name, stage.app])).toEqual([["e2e.apps.api", "api", "api"]]);
  });

  test("a matrix copy's id never collides with an app's own stage or a post step", () => {
    const stageIds = (plan: PipelinePlan) => plan.phases.flatMap((phase) => phase.stages.map((stage) => stage.id));
    const plan = planOf(
      compile({
        workspace: { after: [{ name: "Web", matrix: "apps", sh: "bun run e2e $AKAN_CI_APP" }] },
        apps: { web: { stages: [{ use: "build" }, { name: "API", sh: "bun run test:api" }] } },
      }),
    );
    expect(stageIds(plan)).toEqual(expect.arrayContaining(["web:api", "web.apps.api", "web.apps.web"]));
    expect(new Set(stageIds(plan)).size).toBe(stageIds(plan).length);
    const post = planOf(
      compile({
        ctx: context({ apps: ["success"] }),
        workspaceApps: ["success"],
        workspace: { after: [{ name: "Post", matrix: "apps", sh: "x" }], post: { success: ["y"] } },
      }),
    );
    expect(stageIds(post)).toContain("post.apps.success");
    expect(post.post.success.map((step) => step.id)).toEqual(["post.success/1"]);
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

  describe("ota", () => {
    const webTargets: Record<string, PipelineNativeTargets> = {
      web: {
        targets: [
          { name: "default", updates: true },
          { name: "pilot", updates: true },
          { name: "kiosk", updates: false },
        ],
      },
    };
    const otaPhase = (plan: PipelinePlan) => plan.phases.find((phase) => phase.action === "ota");

    test("is opt-in: zero-config never packs an update", () => {
      expect(otaPhase(planOf(compile({ nativeTargets: webTargets })))).toBeUndefined();
    });

    test("runs after deploy, packing every target with updates for both phones by default", () => {
      const plan = planOf(
        compile({
          nativeTargets: webTargets,
          apps: {
            web: {
              stages: [
                { use: "build" },
                { use: "docker" },
                { use: "deploy" },
                { use: "ota" },
                { name: "Notify", sh: "echo ok" },
              ],
            },
          },
        }),
      );
      expect(phaseIds(plan)).toEqual(["build", "docker", "deploy", "ota", "after-ota"]);
      expect(otaPhase(plan)).toMatchObject({ slot: "ota", milestone: "deploy", name: "OTA", order: "parallel" });
      expect(otaPhase(plan)?.stages).toEqual([
        {
          id: "web:ota",
          name: "web",
          description: null,
          app: "web",
          milestone: "deploy",
          skip: null,
          runtimeWhen: null,
          allowFailure: false,
          timeoutSeconds: null,
          steps: [
            {
              id: "web:ota/ota",
              name: "ota web",
              timeoutSeconds: null,
              retry: null,
              allowFailure: false,
              kind: "action",
              actionVersion: 1,
              action: "ota",
              with: { app: "web", targets: ["default", "pilot"], platforms: ["ios", "android"] },
            },
          ],
        },
      ]);
    });

    test("an app without deploy packs on its own, and named targets and platforms are kept as written", () => {
      const plan = planOf(
        compile({
          ctx: context({ apps: ["web"] }),
          nativeTargets: webTargets,
          apps: { web: { stages: [{ use: "ota", targets: ["pilot"], platforms: ["android"], timeout: "20m" }] } },
        }),
      );
      expect(phaseIds(plan)).toEqual(["ota"]);
      expect(otaPhase(plan)?.stages[0]).toMatchObject({ skip: null, timeoutSeconds: 1200 });
      expect(otaPhase(plan)?.stages[0]?.steps[0]).toMatchObject({
        with: { app: "web", targets: ["pilot"], platforms: ["android"] },
      });
    });

    test("is skipped with the app's earlier action, and takes when.changed like any action", () => {
      const plan = planOf(
        compile({
          ctx: context({ branch: "develop", env: "develop", apps: ["web"] }),
          nativeTargets: webTargets,
          apps: {
            web: {
              stages: [
                { use: "build" },
                { use: "deploy", when: { branch: "main" } },
                { use: "ota", when: { changed: ["apps/web/**"] } },
              ],
            },
          },
        }),
      );
      expect(otaPhase(plan)?.stages[0]).toMatchObject({
        skip: { reason: "deploy of web is skipped" },
        runtimeWhen: { changed: ["apps/web/**"] },
      });
    });

    test("refuses targets without native.updates, unknown targets, and apps whose targets could not be read", () => {
      const ota = (stage: Record<string, unknown>, nativeTargets: Record<string, PipelineNativeTargets> = webTargets) =>
        compile({
          ctx: context({ apps: ["web"] }),
          nativeTargets,
          apps: { web: { stages: [{ use: "ota", ...stage } as never] } },
        });
      const without = ota({ targets: ["default", "kiosk"] });
      expect(without.ok).toBe(false);
      expect(without.diagnostics).toEqual([
        expect.objectContaining({ code: "pipeline.ota.noUpdates", path: "pipeline.stages[0].targets" }),
      ]);
      expect(without.diagnostics[0]?.message).toContain('"kiosk"');
      expect(codes(ota({ targets: ["ghost"] }))).toEqual(["pipeline.ota.unknownTarget"]);
      expect(codes(ota({}, { web: { targets: [{ name: "default", updates: false }] } }))).toEqual([
        "pipeline.ota.noUpdates",
      ]);
      expect(codes(ota({}, { web: { error: "boom" } }))).toEqual(["pipeline.ota.targets"]);
      expect(codes(ota({ platforms: ["macos"] }))).toContain("pipeline.schema.invalid");
      expect(codes(ota({ targets: [] }))).toContain("pipeline.schema.invalid");
      expect(codes(compile({ apps: { web: { stages: [{ use: "build", targets: ["x"] } as never] } } }))).toContain(
        "pipeline.schema.unknownKey",
      );
      expect(
        codes(compile({ nativeTargets: webTargets, apps: { web: { stages: [{ use: "ota" }, { use: "deploy" }] } } })),
      ).toContain("pipeline.action.order");
    });
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
      const pasted = appResult({ stages: [{ name: "x", sh: "x", secrets: ["NPM_TOKEN", "npm_live_value"] }] });
      const secretName = pasted.diagnostics.find((diagnostic) => diagnostic.code === "pipeline.secret.name");
      expect(secretName?.path).toEndWith(".secrets[1]");
      expect(secretName?.message).not.toContain("npm_live_value");
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

    test("a parallel branch may not take the id of a post list's steps", () => {
      const refused = compile({
        workspace: { before: [{ name: "Post", parallel: [{ name: "Success", sh: "x" }] }], post: { success: ["y"] } },
      });
      expect(refused.ok).toBe(false);
      expect(refused.diagnostics).toEqual([
        expect.objectContaining({
          code: "pipeline.id.reserved",
          file: "akan.config.ts",
          path: "pipeline.before[0].parallel[0].name",
        }),
      ]);
      expect(
        compile({
          workspace: { after: [{ id: "post", name: "Checks", parallel: [{ id: "always", name: "A", sh: "x" }] }] },
        }).diagnostics,
      ).toEqual([expect.objectContaining({ code: "pipeline.id.reserved", path: "pipeline.after[0].parallel[0].id" })]);
      const otherBranch = compile({
        workspace: { before: [{ name: "Post", parallel: [{ name: "Lint", sh: "x" }] }], post: { success: ["y"] } },
      });
      expect(otherBranch.ok).toBe(true);
      expect(compile({ workspace: { after: [{ name: "Post", sh: "x" }], post: { success: ["y"] } } }).ok).toBe(true);
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

    test("a function returning nothing, an async one, and a falsy pipeline are errors, never a default", async () => {
      const refused = (result: PipelinePlanResult, file: string) => {
        expect(result.ok).toBe(false);
        expect(result.diagnostics).toContainEqual(
          expect.objectContaining({ severity: "error", code: "pipeline.schema.invalid", file, path: "pipeline" }),
        );
        return result.diagnostics.map((diagnostic) => diagnostic.message).join("\n");
      };
      const onMainOnly = ((ctx: { branch: string }) =>
        ctx.branch === "main" ? { stages: [{ use: "build" }] } : undefined) as unknown as AppPipelineConfig;
      expect(appResult(onMainOnly).ok).toBe(true);
      const develop = compile({ ctx: context({ branch: "develop", apps: ["web"] }), apps: { web: onMainOnly } });
      expect(refused(develop, "apps/web/akan.config.ts")).toContain("returned nothing");
      expect(refused(compile({ workspace: (() => undefined) as never }), "akan.config.ts")).toContain(
        "returned nothing",
      );
      expect(refused(compile({ workspace: (async () => ({ before: [] })) as never }), "akan.config.ts")).toContain(
        "Promise",
      );
      const rejecting = (async () => {
        throw new Error("boom");
      }) as unknown as AppPipelineConfig;
      expect(refused(appResult(rejecting), "apps/web/akan.config.ts")).toContain("Promise");
      await Bun.sleep(1);
      expect(refused(appResult(false as never), "apps/web/akan.config.ts")).toContain("must be an object");
      expect(refused(compile({ workspace: 0 as never }), "akan.config.ts")).toContain("must be an object");
    });

    test("a plan larger than an executor reads, as written, is refused", () => {
      const steps = Array.from({ length: 20 }, () => "x".repeat(60_000));
      const result = appResult({ stages: [{ use: "build" }, { name: "Big", steps }] });
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: "pipeline.limit.exceeded", file: null, path: null }),
      );
    });

    test("conditions", () => {
      expect(appResult({ stages: [{ use: "build", when: { trigger: [] } }] }).diagnostics).toContainEqual(
        expect.objectContaining({ code: "pipeline.schema.invalid", path: "pipeline.stages[0].when.trigger" }),
      );
      const branch = Array.from({ length: 6 }, (_, idx) => `release/${String(idx).repeat(240)}`);
      const plan = planOf(
        compile({
          ctx: context({ branch: "develop", env: "develop", apps: ["web"] }),
          apps: { web: { stages: [{ use: "build", when: { branch } }] } },
        }),
      );
      const reason = plan.phases[0]?.stages[0]?.skip?.reason ?? "";
      expect(reason.startsWith('branch "develop" does not match "release/')).toBe(true);
      expect(reason.endsWith("…")).toBe(true);
      expect(reason.length).toBeLessThanOrEqual(1024);
    });

    test("a value the plan would refuse is reported where it was written", () => {
      expect(
        appResult({ stages: [{ use: "build" }, { name: "x", sh: "x", env: { BIG: "x".repeat(64 * 1024 + 1) } }] })
          .diagnostics,
      ).toContainEqual(
        expect.objectContaining({ code: "pipeline.limit.exceeded", path: "pipeline.stages[1].env.BIG" }),
      );
      const unset = compile({ workspace: { before: [{ name: "Checks", parallel: undefined as never }] } });
      expect(unset.ok).toBe(false);
      expect(unset.diagnostics).toEqual([
        expect.objectContaining({
          code: "pipeline.schema.invalid",
          file: "akan.config.ts",
          path: "pipeline.before[0].parallel",
        }),
      ]);
    });

    test("a key set to undefined is the key left out", () => {
      const stage = { name: "Test", sh: "bun test", use: undefined, parallel: undefined, matrix: undefined };
      const plan = planOf(
        compile({
          workspace: {
            before: [stage as never, { name: "Checks", parallel: [{ name: "Lint", sh: "x", use: undefined }] }],
          },
          apps: { web: { stages: [{ use: "build", targets: undefined } as never, stage as never] } },
        }),
      );
      expect(phaseIds(plan)).toEqual(["test", "checks", "build", "after-build", "docker", "deploy"]);
      expect(appResult({ stages: [{ use: undefined } as never] }).diagnostics).toContainEqual(
        expect.objectContaining({ code: "pipeline.schema.invalid", path: "pipeline.stages[0].use" }),
      );
    });

    test("a value JSON cannot hold is reported, never thrown", () => {
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      const result = appResult({ stages: [{ use: "build", timeout: 10n as never }, { use: cyclic as never }] });
      expect(result.ok).toBe(false);
      expect(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.message.split(" ")[0]])).toEqual([
        ["pipeline.duration.invalid", "10n"],
        ["pipeline.schema.invalid", "[object"],
      ]);
    });

    test("a long first line names its step without splitting a surrogate pair", () => {
      const plan = planOf(
        appResult({ stages: [{ use: "build" }, { name: "Emoji", sh: `${"a".repeat(78)}${"😀".repeat(5)}` }] }),
      );
      const name = plan.phases.find((phase) => phase.id === "after-build")?.stages[0]?.steps[0]?.name;
      expect(name).toBe(`${"a".repeat(78)}…`);
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

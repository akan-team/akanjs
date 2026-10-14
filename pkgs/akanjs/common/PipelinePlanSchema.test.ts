import { describe, expect, test } from "bun:test";
import { PipelinePlanSchema } from "./PipelinePlanSchema";
import type {
  PipelineActionName,
  PipelinePlan,
  PipelinePlanPhase,
  PipelinePlanResult,
  PipelinePlanShellStep,
} from "./pipelinePlan";

const sha = (char: string) => char.repeat(64);

const actionPhase = (
  action: Exclude<PipelineActionName, "ota">,
  milestone: PipelinePlanPhase["milestone"],
): PipelinePlanPhase => ({
  id: action,
  name: action,
  description: null,
  slot: action,
  milestone,
  action,
  order: action === "deploy" ? "sequential" : "parallel",
  maxParallel: null,
  failFast: false,
  timeoutSeconds: null,
  stages: ["api", "web"].map((app) => ({
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
        name: `${action} ${app}`,
        timeoutSeconds: null,
        retry: null,
        allowFailure: false,
        kind: "action",
        action,
        actionVersion: 1,
        with: { app },
      },
    ],
  })),
});

const shellStep = (id: string, overrides: Partial<PipelinePlanShellStep> = {}): PipelinePlanShellStep => ({
  id,
  name: id,
  timeoutSeconds: null,
  retry: null,
  allowFailure: false,
  kind: "sh",
  run: "bun test",
  cwd: ".",
  env: {},
  secrets: [],
  skipExitCodes: [],
  ...overrides,
});

const zeroConfigPlan = (): PipelinePlan => ({
  schemaVersion: 1,
  sources: {
    workspace: null,
    apps: {
      api: { file: "apps/api/akan.config.ts", sha256: sha("a"), declared: false },
      web: { file: "apps/web/akan.config.ts", sha256: sha("b"), declared: false },
    },
  },
  planner: { akanVersion: "3.0.3" },
  context: { branch: "main", env: "main", apps: ["api", "web"], trigger: "push", buildNum: 12, commit: "5ab138a1" },
  appOrder: ["api", "web"],
  timeoutSeconds: null,
  requiredSecrets: [],
  phases: [actionPhase("build", "build"), actionPhase("docker", "package"), actionPhase("deploy", "deploy")],
  post: { success: [], failure: [], canceled: [], always: [] },
});

const fullPlan = (): PipelinePlan => {
  const plan = zeroConfigPlan();
  plan.sources.workspace = { file: "akan.config.ts", sha256: sha("c"), declared: true };
  plan.timeoutSeconds = 3600;
  plan.requiredSecrets = ["DISCORD_WEBHOOK", "NPM_TOKEN"];
  plan.phases.splice(1, 0, {
    id: "after-build",
    name: "After build",
    description: "Checks after every build",
    slot: "after-build",
    milestone: "verify",
    action: null,
    order: "parallel",
    maxParallel: 2,
    failFast: true,
    timeoutSeconds: 900,
    stages: [
      {
        id: "web:test",
        name: "Test",
        description: null,
        app: "web",
        milestone: "verify",
        skip: null,
        runtimeWhen: { changed: ["apps/web/**", "!**/*.md"] },
        allowFailure: true,
        timeoutSeconds: 600,
        steps: [
          shellStep("web:test/1", {
            cwd: "apps/web",
            env: { NODE_ENV: "test" },
            secrets: ["NPM_TOKEN"],
            retry: { attempts: 2, delaySeconds: 5 },
            skipExitCodes: [3],
            timeoutSeconds: 300,
          }),
        ],
      },
      {
        id: "after-build.lint",
        name: "Lint",
        description: null,
        app: null,
        milestone: "verify",
        skip: { reason: 'branch "develop" does not match "main"' },
        runtimeWhen: null,
        allowFailure: false,
        timeoutSeconds: null,
        steps: [shellStep("after-build.lint/lint")],
      },
    ],
  });
  plan.post.failure = [shellStep("post.failure/notify", { secrets: ["DISCORD_WEBHOOK"] })];
  return plan;
};

const envelope = (plan: PipelinePlan): PipelinePlanResult => ({ ok: true, plan, diagnostics: [] });

const refused = (mutate: (plan: PipelinePlan) => void, message: string) => {
  const plan = fullPlan();
  mutate(plan);
  expect(() => PipelinePlanSchema.parse(plan)).toThrow(message);
};

describe("PipelinePlanSchema", () => {
  test("accepts a zero-config plan and returns it unchanged", () => {
    const plan = zeroConfigPlan();
    expect(PipelinePlanSchema.parse(plan)).toEqual(plan);
  });

  test("accepts a plan that uses every field", () => {
    const plan = fullPlan();
    expect(PipelinePlanSchema.parse(plan)).toEqual(plan);
  });

  test("reads an envelope from text, and checks its size first", () => {
    const text = JSON.stringify(envelope(fullPlan()));
    expect(PipelinePlanSchema.parseText(text)).toEqual(envelope(fullPlan()));
    expect(() => PipelinePlanSchema.parseText(`${text}${" ".repeat(1024 * 1024)}`)).toThrow("byte limit");
    expect(() => PipelinePlanSchema.parseText("{")).toThrow("not JSON");
  });

  test("a failed envelope carries no plan and at least one error", () => {
    const error = { severity: "error", code: "pipeline.load.failed", message: "boom", file: null, path: null };
    expect(PipelinePlanSchema.parseResult({ ok: false, plan: null, diagnostics: [error] })).toEqual({
      ok: false,
      plan: null,
      diagnostics: [error],
    } as PipelinePlanResult);
    expect(() => PipelinePlanSchema.parseResult({ ok: false, plan: null, diagnostics: [] })).toThrow("hold an error");
    expect(() => PipelinePlanSchema.parseResult({ ok: false, plan: zeroConfigPlan(), diagnostics: [error] })).toThrow(
      "must be null",
    );
  });

  test("refuses unknown and missing keys anywhere", () => {
    refused((plan) => Object.assign(plan, { extra: 1 }), '"extra" is not a known key');
    refused((plan) => Object.assign(plan.phases[0]?.stages[0]?.steps[0] ?? {}, { shell: "bash" }), '"shell"');
    refused((plan) => {
      delete (plan.context as Partial<PipelinePlan["context"]>).commit;
    }, '"commit" is missing');
  });

  test("refuses versions and actions it does not know", () => {
    refused((plan) => Object.assign(plan, { schemaVersion: 2 }), "is not version 1");
    refused((plan) => {
      const step = plan.phases[0]?.stages[0]?.steps[0];
      if (step?.kind === "action") Object.assign(step, { actionVersion: 2 });
    }, "is not a version of build");
    refused((plan) => Object.assign(plan.phases[0] ?? {}, { action: "ship" }), '"ship" is not one of');
    refused((plan) => Object.assign(plan.context, { trigger: "cron" }), '"cron" is not one of');
  });

  test("an ota step names its targets and phones, each once", () => {
    const otaPlan = () => {
      const plan = zeroConfigPlan();
      const [stage] = actionPhase("deploy", "deploy").stages;
      if (!stage) throw new Error("no stage");
      plan.phases.push({
        ...actionPhase("deploy", "deploy"),
        id: "ota",
        name: "OTA",
        slot: "ota",
        action: "ota",
        order: "parallel",
        stages: [
          {
            ...stage,
            id: "api:ota",
            steps: [
              {
                id: "api:ota/ota",
                name: "ota api",
                timeoutSeconds: null,
                retry: null,
                allowFailure: false,
                kind: "action",
                action: "ota",
                actionVersion: 1,
                with: { app: "api", targets: ["default"], platforms: ["ios", "android"] },
              },
            ],
          },
        ],
      });
      return plan;
    };
    expect(PipelinePlanSchema.parse(otaPlan())).toEqual(otaPlan());
    const refusedOta = (with_: unknown, message: string) => {
      const plan = otaPlan();
      Object.assign(plan.phases[3]?.stages[0]?.steps[0] ?? {}, { with: with_ });
      expect(() => PipelinePlanSchema.parse(plan)).toThrow(message);
    };
    refusedOta({ app: "api" }, '"targets" is missing');
    refusedOta({ app: "api", targets: [], platforms: ["ios"] }, "may not be empty");
    refusedOta({ app: "api", targets: ["a", "a"], platforms: ["ios"] }, "lists one twice");
    refusedOta({ app: "api", targets: ["a"], platforms: ["macos"] }, '"macos" is not one of');
    refusedOta({ app: "web", targets: ["a"], platforms: ["ios"] }, "for the stage's own app");
  });

  test("holds the structure every executor relies on", () => {
    refused((plan) => Object.assign(plan, { appOrder: ["web"] }), "must order exactly the apps");
    refused((plan) => Object.assign(plan.phases[3] ?? {}, { order: "parallel" }), "one at a time");
    refused((plan) => Object.assign(plan.phases[0] ?? {}, { slot: "docker" }), 'sits in the "build" slot');
    refused((plan) => Object.assign(plan.phases[1] ?? {}, { slot: "deploy" }), "holds the deploy action phase only");
    refused((plan) => {
      const stage = plan.phases[0]?.stages[0];
      if (stage) stage.app = "web";
    }, "for the stage's own app");
    refused((plan) => {
      const stage = plan.phases[1]?.stages[1];
      const action = plan.phases[0]?.stages[0]?.steps[0];
      if (stage && action) stage.steps.push({ ...action, id: "x/1" });
    }, "its own action phase only");
    refused((plan) => {
      const stage = plan.phases[1]?.stages[0];
      if (stage) stage.app = "edge";
    }, '"edge" is not in context.apps');
    refused((plan) => {
      const stage = plan.phases[1]?.stages[1];
      if (stage) stage.id = "web:test";
    }, "the id of another stage");
    refused((plan) => {
      const step = plan.phases[1]?.stages[1]?.steps[0];
      if (step) step.id = "web:test/1";
    }, "the id of another step");
    refused((plan) => {
      const phase = plan.phases[1];
      if (phase) phase.id = "build";
    }, "the id of another phase");
  });

  test("refuses unsafe step contents", () => {
    const testStep = (plan: PipelinePlan) => plan.phases[1]?.stages[0]?.steps[0] as PipelinePlanShellStep;
    refused((plan) => Object.assign(testStep(plan), { cwd: "../outside" }), "not a path inside the workspace");
    refused((plan) => Object.assign(testStep(plan), { cwd: "/etc" }), "not a path inside the workspace");
    refused((plan) => Object.assign(testStep(plan), { env: { AKAN_CI_APP: "web" } }), "reserved for the executor");
    refused((plan) => Object.assign(testStep(plan), { env: { "BAD-NAME": "x" } }), "not an environment variable");
    refused((plan) => Object.assign(testStep(plan), { secrets: ["PATH"] }), "reserved for the executor");
    const pasted = (plan: PipelinePlan) => Object.assign(testStep(plan), { secrets: ["NPM_TOKEN", "npm_live_value"] });
    refused(pasted, "steps[0].secrets[1]: the name is not a secret name");
    expect(() => {
      const plan = fullPlan();
      pasted(plan);
      PipelinePlanSchema.parse(plan);
    }).not.toThrow("npm_live_value");
    refused((plan) => Object.assign(testStep(plan), { retry: { attempts: 11, delaySeconds: 0 } }), "between 1 and 10");
    refused((plan) => Object.assign(testStep(plan), { skipExitCodes: [0] }), "between 1 and 255");
    refused((plan) => Object.assign(testStep(plan), { skipExitCodes: [3, 3] }), "lists a code twice");
    refused((plan) => Object.assign(testStep(plan), { run: "x".repeat(64 * 1024 + 1) }), "at most 65536 bytes");
  });

  test("keeps requiredSecrets equal to what the steps name", () => {
    refused((plan) => Object.assign(plan, { requiredSecrets: ["NPM_TOKEN"] }), "exactly the secrets its steps name");
    refused(
      (plan) => Object.assign(plan, { requiredSecrets: ["DISCORD_WEBHOOK", "NPM_TOKEN", "UNUSED"] }),
      "exactly the secrets its steps name",
    );
  });

  test("refuses runtime patterns the dialect does not have, post actions and malformed sources", () => {
    refused((plan) => {
      const stage = plan.phases[1]?.stages[0];
      if (stage) stage.runtimeWhen = { changed: ["apps/{web,api}/**"] };
    }, "braces");
    refused((plan) => {
      const action = plan.phases[0]?.stages[0]?.steps[0];
      if (action) plan.post.always = [{ ...action, id: "post.always/x" }] as unknown as PipelinePlanShellStep[];
    }, "a post step is a shell step");
    refused((plan) => {
      const source = plan.sources.apps.api;
      if (source) source.sha256 = "<sha256 of the file>";
    }, "lowercase sha256");
  });
});

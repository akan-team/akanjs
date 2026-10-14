import {
  type AppPipelineConfig,
  type AppPipelineContext,
  defaultAppPipeline,
  type PipelineContext,
  type WorkspacePipelineConfig,
} from "akanjs";
import {
  type PipelineActionName,
  type PipelineDiagnostic,
  type PipelineMilestone,
  type PipelineOtaPlatform,
  PipelinePattern,
  type PipelinePlan,
  type PipelinePlanContext,
  type PipelinePlanPhase,
  type PipelinePlanPost,
  type PipelinePlanResult,
  PipelinePlanSchema,
  type PipelinePlanShellStep,
  type PipelinePlanSource,
  type PipelinePlanStage,
  type PipelineSkip,
  pipelineActionNames,
  pipelineActions,
  pipelineMilestones,
  pipelineOtaPlatforms,
  pipelinePlanLimits,
  pipelinePlanVersion,
  toError,
} from "akanjs/common";
import { PipelineInputReader } from "./PipelineInputReader";
import type {
  PipelineActionStageRule,
  PipelineAppRule,
  PipelinePostRule,
  PipelineShellStageRule,
  PipelineStepRule,
  PipelineWhenRule,
  PipelineWorkspaceRule,
  PipelineWorkspaceStageRule,
} from "./PipelineRules";

export interface PipelineSourceFile<T> {
  /** Relative to the workspace root, with `/`. */
  file: string;
  sha256: string;
  pipeline: T | null;
}

/** An app's native targets as `akan pack-update --target` names them, or why they could not be read. */
export type PipelineNativeTargets = { targets: { name: string; updates: boolean }[] } | { error: string };

export interface PipelineCompileInput {
  context: PipelinePlanContext;
  workspaceApps: readonly string[];
  workspace: PipelineSourceFile<WorkspacePipelineConfig> | null;
  apps: ReadonlyMap<string, PipelineSourceFile<AppPipelineConfig>>;
  /** Read only for an app whose pipeline takes `ota`. */
  nativeTargets?: ReadonlyMap<string, PipelineNativeTargets>;
  akanVersion: string;
  /** Function forms run against a sample context (`validate`), which is said once per file. */
  sampled?: boolean;
  diagnostics?: readonly PipelineDiagnostic[];
}

type CustomSlot = "before-build" | "after-build" | "after-docker" | "after-deploy" | "after-ota";

interface AppLane {
  file: string;
  env: Record<string, string>;
  after: string[];
  actions: Map<PipelineActionName, PipelineActionStageRule>;
  skips: Map<PipelineActionName, PipelineSkip | null>;
  slots: Record<CustomSlot, PipelineShellStageRule[]>;
  ota: { targets: string[]; platforms: PipelineOtaPlatform[] } | null;
}

interface StageOptions {
  id: string;
  name?: string;
  app?: string | null;
  milestone: PipelineMilestone;
  env: Record<string, string>;
  inheritedSkip?: PipelineSkip | null;
  allowFailure?: boolean;
  changed?: string[] | null;
  timeoutSeconds?: number | null;
}

export class PipelineCompiler {
  static readonly #slotAfter = {
    build: "after-build",
    docker: "after-docker",
    deploy: "after-deploy",
    ota: "after-ota",
  } as const;
  static readonly #slotMilestones = {
    "before-build": "prepare",
    "after-build": "verify",
    "after-docker": "package",
    "after-deploy": "deploy",
    "after-ota": "deploy",
  } as const;
  static readonly #slotNames = {
    "before-build": "Before build",
    "after-build": "After build",
    "after-docker": "After docker",
    "after-deploy": "After deploy",
    "after-ota": "After OTA",
  } as const;
  static readonly #reservedPhaseId =
    /^(?:build|docker|deploy|ota|(?:before-build|after-build|after-docker|after-deploy|after-ota)(?:-\d+)?)$/;
  static readonly #actionStepNames = { build: "akan build", docker: "image", deploy: "deploy", ota: "ota" } as const;
  //? PipelinePlanSchema reads at most 1024 characters of a skip reason.
  static readonly #reasonChars = 1024;

  static compile(input: PipelineCompileInput): PipelinePlanResult {
    return new PipelineCompiler(input).#compile();
  }

  readonly #input: PipelineCompileInput;
  readonly #diagnostics: PipelineDiagnostic[];
  readonly #secrets = new Set<string>();

  constructor(input: PipelineCompileInput) {
    this.#input = input;
    this.#diagnostics = [...(input.diagnostics ?? [])];
  }

  #compile(): PipelinePlanResult {
    const { context, workspaceApps } = this.#input;
    this.#checkContext();
    const pipelineContext: PipelineContext = {
      ...context,
      apps: [...context.apps],
      workspaceApps: [...workspaceApps],
    };
    const workspace = this.#readWorkspace(pipelineContext);
    const lanes = new Map<string, AppLane>();
    for (const app of new Set(context.apps)) {
      const lane = this.#readApp(app, pipelineContext);
      if (lane) lanes.set(app, lane);
    }
    const appOrder = this.#appOrder(lanes);
    if (this.#hasErrors()) return this.#failed();
    const workspaceEnv = workspace?.env ?? {};
    const phases = this.#phases(workspace, lanes, appOrder, workspaceEnv);
    const post = this.#post(workspace?.post, workspaceEnv);
    if (this.#hasErrors()) return this.#failed();
    const plan: PipelinePlan = {
      schemaVersion: pipelinePlanVersion,
      sources: this.#sources(),
      planner: { akanVersion: this.#input.akanVersion },
      context: { ...context, apps: [...context.apps] },
      appOrder,
      timeoutSeconds: workspace?.timeoutSeconds ?? null,
      requiredSecrets: [...this.#secrets].sort(),
      phases,
      post,
    };
    try {
      PipelinePlanSchema.parse(plan);
    } catch (error) {
      const message = toError(error).message;
      this.#error(message.includes("at most") ? "pipeline.limit.exceeded" : "pipeline.internal", message, null, null);
      return this.#failed();
    }
    const result: PipelinePlanResult = { ok: true, plan, diagnostics: this.#diagnostics };
    //? Sized as `akan pipeline plan --out` writes it, since that text is what an executor's parseText bounds.
    const bytes = new TextEncoder().encode(`${JSON.stringify(result, null, 2)}\n`).length;
    if (bytes > pipelinePlanLimits.planBytes) {
      this.#error(
        "pipeline.limit.exceeded",
        `the plan is ${bytes} bytes as written, and an executor reads at most ${pipelinePlanLimits.planBytes}`,
        null,
        null,
      );
      return this.#failed();
    }
    return result;
  }

  #checkContext() {
    const { context, workspaceApps } = this.#input;
    const seen = new Set<string>();
    for (const app of context.apps) {
      if (seen.has(app)) this.#error("pipeline.context.duplicateApp", `"${app}" is given twice`, null, "apps");
      seen.add(app);
      if (!workspaceApps.includes(app))
        this.#error("pipeline.context.unknownApp", `"${app}" is not an app of this workspace`, null, "apps");
    }
  }

  #readWorkspace(context: PipelineContext): PipelineWorkspaceRule | null {
    const source = this.#input.workspace;
    if (source?.pipeline == null) return null;
    const evaluated = this.#evaluate(source.pipeline, context, source.file);
    if (!evaluated) return null;
    const reader = new PipelineInputReader(source.file);
    const rule = reader.workspace(evaluated.value);
    this.#diagnostics.push(...reader.diagnostics);
    return rule;
  }

  #readApp(app: string, context: PipelineContext): AppLane | null {
    const source = this.#input.apps.get(app);
    if (!source) return null;
    const appContext: AppPipelineContext = { ...context, app };
    const evaluated =
      source.pipeline == null
        ? { value: defaultAppPipeline }
        : this.#evaluate(source.pipeline, appContext, source.file);
    if (!evaluated) return null;
    const reader = new PipelineInputReader(source.file);
    const rule = reader.app(evaluated.value);
    this.#diagnostics.push(...reader.diagnostics);
    return rule ? this.#lane(app, rule, source.file) : null;
  }

  #evaluate<C>(config: unknown, context: C, file: string): { value: unknown } | null {
    let value = config;
    if (typeof config === "function") {
      if (this.#input.sampled)
        this.#warning(
          "pipeline.function.sampled",
          "a function form was checked against one sample context; other branches, triggers or apps may differ",
          file,
          "pipeline",
        );
      try {
        value = (config as (context: C) => unknown)(context);
      } catch (error) {
        this.#error("pipeline.load.failed", `the pipeline function threw: ${toError(error).message}`, file, "pipeline");
        return null;
      }
      if (value === undefined) {
        this.#error(
          "pipeline.schema.invalid",
          "the pipeline function returned nothing for this run: return a pipeline on every path",
          file,
          "pipeline",
        );
        return null;
      }
    }
    if (typeof (value as PromiseLike<unknown> | null)?.then === "function") {
      //? Handled so a rejection cannot end the CLI before it writes the envelope.
      void Promise.resolve(value).catch(() => undefined);
      this.#error(
        "pipeline.schema.invalid",
        "is a Promise, which the planner cannot wait for: return the pipeline itself, not from an async function",
        file,
        "pipeline",
      );
      return null;
    }
    return { value };
  }

  #lane(app: string, rule: PipelineAppRule, file: string): AppLane {
    const lane: AppLane = {
      file,
      env: rule.env,
      after: rule.after,
      actions: new Map(),
      skips: new Map(),
      slots: { "before-build": [], "after-build": [], "after-docker": [], "after-deploy": [], "after-ota": [] },
      ota: null,
    };
    let last: PipelineActionName | null = null;
    let lastMilestone = -1;
    for (const stage of rule.stages) {
      const milestone =
        stage.milestone ??
        (stage.kind === "action"
          ? pipelineActions[stage.action].milestone
          : PipelineCompiler.#slotMilestones[last ? PipelineCompiler.#slotAfter[last] : "before-build"]);
      const rank = pipelineMilestones.indexOf(milestone);
      if (stage.milestone && rank < lastMilestone)
        this.#warning(
          "pipeline.milestone.backwards",
          `"${milestone}" comes after a later milestone, so progress would move backwards`,
          file,
          `${stage.path}.milestone`,
        );
      lastMilestone = Math.max(lastMilestone, rank);
      if (stage.kind === "sh") {
        lane.slots[last ? PipelineCompiler.#slotAfter[last] : "before-build"].push(stage);
        continue;
      }
      if (lane.actions.has(stage.action)) {
        this.#error("pipeline.action.duplicate", `\`${stage.action}\` is declared twice`, file, stage.path);
        continue;
      }
      if (last && pipelineActionNames.indexOf(stage.action) < pipelineActionNames.indexOf(last))
        this.#error(
          "pipeline.action.order",
          `\`${stage.action}\` comes after \`${last}\` here, but the actions run ${pipelineActionNames.join(", ")}`,
          file,
          stage.path,
        );
      lane.actions.set(stage.action, stage);
      last = stage.action;
    }
    const docker = lane.actions.get("docker");
    if (docker && !lane.actions.has("build"))
      this.#error(
        "pipeline.action.dockerWithoutBuild",
        `\`docker\` builds the image from this run's \`akan build\` of ${app}, so it needs a \`build\` before it`,
        file,
        docker.path,
      );
    const deploy = lane.actions.get("deploy");
    if (deploy && !lane.actions.has("docker"))
      this.#warning(
        "pipeline.action.deployWithoutDocker",
        `\`deploy\` without \`docker\` deploys the image last pushed for ${app}`,
        file,
        deploy.path,
      );
    const ota = lane.actions.get("ota");
    if (ota) lane.ota = this.#otaTargets(app, ota, file);
    if (!lane.actions.size)
      this.#warning(
        "pipeline.app.noActions",
        `the pipeline of ${app} takes no built-in action, so this run neither builds nor deploys it`,
        file,
        "pipeline.stages",
      );
    let previous: PipelineActionName | null = null;
    for (const action of pipelineActionNames) {
      const stage = lane.actions.get(action);
      if (!stage) continue;
      const inherited = previous && lane.skips.get(previous) ? { reason: `${previous} of ${app} is skipped` } : null;
      lane.skips.set(action, this.#skipOf(stage.when) ?? inherited);
      previous = action;
    }
    return lane;
  }

  //? Checked here, not by the executor: a pack for a target without updates fails in the build pod after its CSR build.
  #otaTargets(app: string, stage: PipelineActionStageRule, file: string): AppLane["ota"] {
    const platforms = stage.platforms ?? [...pipelineOtaPlatforms];
    const native = this.#input.nativeTargets?.get(app);
    if (!native || "error" in native) {
      this.#error(
        "pipeline.ota.targets",
        `\`ota\` needs the native targets of ${app}, which could not be read${native ? `: ${native.error}` : ""}`,
        file,
        stage.path,
      );
      return null;
    }
    const known = new Map(native.targets.map((target) => [target.name, target.updates]));
    if (!stage.targets) {
      const targets = native.targets.filter((target) => target.updates).map((target) => target.name);
      if (targets.length) return { targets, platforms };
      this.#error(
        "pipeline.ota.noUpdates",
        `\`ota\` packs updates for targets that declare native.updates, and no native target of ${app} does`,
        file,
        stage.path,
      );
      return null;
    }
    const unknown = stage.targets.filter((name) => !known.has(name));
    const withoutUpdates = stage.targets.filter((name) => known.get(name) === false);
    if (unknown.length)
      this.#error(
        "pipeline.ota.unknownTarget",
        `${unknown.map((name) => `"${name}"`).join(", ")} ${unknown.length > 1 ? "are not native targets" : "is not a native target"} of ${app}: ${[...known.keys()].join(", ")}`,
        file,
        `${stage.path}.targets`,
      );
    if (withoutUpdates.length)
      this.#error(
        "pipeline.ota.noUpdates",
        `\`ota\` packs updates for targets that declare native.updates, and ${withoutUpdates.map((name) => `"${name}"`).join(", ")} of ${app} ${withoutUpdates.length > 1 ? "do" : "does"} not`,
        file,
        `${stage.path}.targets`,
      );
    return unknown.length || withoutUpdates.length ? null : { targets: stage.targets, platforms };
  }

  #appOrder(lanes: ReadonlyMap<string, AppLane>): string[] {
    const apps = [...new Set(this.#input.context.apps)];
    const known = new Set(apps);
    const after = new Map(
      apps.map((app) => [app, new Set((lanes.get(app)?.after ?? []).filter((dep) => known.has(dep) && dep !== app))]),
    );
    const order: string[] = [];
    const done = new Set<string>();
    while (order.length < apps.length) {
      const next = apps.find((app) => !done.has(app) && [...(after.get(app) ?? [])].every((dep) => done.has(dep)));
      if (!next) {
        const waiting = apps.filter((app) => !done.has(app));
        this.#error(
          "pipeline.app.afterCycle",
          `\`after\` makes a cycle among ${waiting.join(", ")}`,
          lanes.get(waiting[0] ?? "")?.file ?? null,
          "pipeline.after",
        );
        return apps;
      }
      order.push(next);
      done.add(next);
    }
    return order;
  }

  #phases(
    workspace: PipelineWorkspaceRule | null,
    lanes: ReadonlyMap<string, AppLane>,
    appOrder: string[],
    workspaceEnv: Record<string, string>,
  ): PipelinePlanPhase[] {
    const phases: PipelinePlanPhase[] = [];
    for (const stage of workspace?.before ?? [])
      phases.push(...this.#workspacePhase(stage, "before", appOrder, workspaceEnv));
    phases.push(...this.#customPhases("before-build", lanes, appOrder, workspaceEnv));
    for (const action of pipelineActionNames) {
      const phase = this.#actionPhase(action, lanes, appOrder);
      if (phase) phases.push(phase);
      phases.push(...this.#customPhases(PipelineCompiler.#slotAfter[action], lanes, appOrder, workspaceEnv));
    }
    for (const stage of workspace?.after ?? [])
      phases.push(...this.#workspacePhase(stage, "after", appOrder, workspaceEnv));
    return phases;
  }

  #actionPhase(
    action: PipelineActionName,
    lanes: ReadonlyMap<string, AppLane>,
    appOrder: string[],
  ): PipelinePlanPhase | null {
    const stages = appOrder.flatMap((app): PipelinePlanStage[] => {
      const lane = lanes.get(app);
      const rule = lane?.actions.get(action);
      if (!lane || !rule) return [];
      const id = `${app}:${rule.id}`;
      return [
        {
          id,
          name: rule.named ? rule.name : app,
          description: rule.description,
          app,
          milestone: rule.milestone ?? pipelineActions[action].milestone,
          skip: lane.skips.get(action) ?? null,
          runtimeWhen: rule.when.changed ? { changed: rule.when.changed } : null,
          allowFailure: rule.allowFailure,
          timeoutSeconds: rule.timeoutSeconds,
          steps: [
            {
              id: `${id}/${action}`,
              name: `${PipelineCompiler.#actionStepNames[action]} ${app}`,
              timeoutSeconds: null,
              retry: rule.retry,
              allowFailure: false,
              kind: "action",
              actionVersion: pipelineActions[action].version,
              ...(action === "ota"
                ? { action, with: { app, targets: lane.ota?.targets ?? [], platforms: lane.ota?.platforms ?? [] } }
                : { action, with: { app } }),
            },
          ],
        },
      ];
    });
    if (!stages.length) return null;
    return {
      id: action,
      name: pipelineActions[action].name,
      description: null,
      slot: action,
      milestone: pipelineActions[action].milestone,
      action,
      order: action === "deploy" ? "sequential" : "parallel",
      maxParallel: null,
      failFast: false,
      timeoutSeconds: null,
      stages,
    };
  }

  #customPhases(
    slot: CustomSlot,
    lanes: ReadonlyMap<string, AppLane>,
    appOrder: string[],
    workspaceEnv: Record<string, string>,
  ): PipelinePlanPhase[] {
    const depth = Math.max(0, ...appOrder.map((app) => lanes.get(app)?.slots[slot].length ?? 0));
    const milestone = PipelineCompiler.#slotMilestones[slot];
    return Array.from({ length: depth }, (_, idx): PipelinePlanPhase => {
      const stages = appOrder.flatMap((app) => {
        const lane = lanes.get(app);
        const rule = lane?.slots[slot][idx];
        if (!lane || !rule) return [];
        return [
          this.#shellStage(rule, {
            id: `${app}:${rule.id}`,
            app,
            milestone: rule.milestone ?? milestone,
            env: { ...workspaceEnv, ...lane.env },
          }),
        ];
      });
      return {
        id: idx === 0 ? slot : `${slot}-${idx + 1}`,
        name: idx === 0 ? PipelineCompiler.#slotNames[slot] : `${PipelineCompiler.#slotNames[slot]} ${idx + 1}`,
        description: null,
        slot,
        milestone,
        action: null,
        order: "parallel",
        maxParallel: null,
        failFast: false,
        timeoutSeconds: null,
        stages,
      };
    });
  }

  #workspacePhase(
    stage: PipelineWorkspaceStageRule,
    position: "before" | "after",
    appOrder: string[],
    env: Record<string, string>,
  ): PipelinePlanPhase[] {
    if (PipelineCompiler.#reservedPhaseId.test(stage.id))
      this.#error(
        "pipeline.id.reserved",
        `"${stage.id}" is the id of a phase the planner makes; give this stage another \`id\``,
        this.#input.workspace?.file ?? null,
        stage.path,
      );
    const milestone = stage.milestone ?? (position === "before" ? "prepare" : "finish");
    const phase = {
      id: stage.id,
      name: stage.name,
      description: stage.description,
      slot: position,
      milestone,
      action: null,
      order: "parallel",
    } as const;
    if (stage.kind === "sh")
      return [
        {
          ...phase,
          maxParallel: null,
          failFast: false,
          timeoutSeconds: null,
          stages: [this.#shellStage(stage, { id: stage.id, milestone, env })],
        },
      ];
    const parentSkip = this.#skipOf(stage.when);
    if (stage.kind === "parallel")
      return [
        {
          ...phase,
          maxParallel: stage.maxParallel,
          failFast: stage.failFast,
          timeoutSeconds: stage.timeoutSeconds,
          stages: stage.branches.map((branch) =>
            this.#shellStage(branch, {
              id: `${stage.id}.${branch.id}`,
              milestone: branch.milestone ?? milestone,
              env,
              inheritedSkip: parentSkip,
              allowFailure: stage.allowFailure,
              changed: stage.when.changed,
            }),
          ),
        },
      ];
    const apps = appOrder.filter((app) => !stage.when.app || PipelinePattern.matches(stage.when.app, app));
    if (!apps.length) return [];
    const copy: PipelineShellStageRule = { ...stage, kind: "sh", timeoutSeconds: null };
    return [
      {
        ...phase,
        maxParallel: stage.maxParallel,
        failFast: false,
        timeoutSeconds: stage.timeoutSeconds,
        stages: apps.map((app) =>
          this.#shellStage(copy, { id: `${stage.id}.apps.${app}`, name: app, app, milestone, env }),
        ),
      },
    ];
  }

  #shellStage(rule: PipelineShellStageRule, options: StageOptions): PipelinePlanStage {
    const changed = options.changed ?? rule.when.changed;
    return {
      id: options.id,
      name: options.name ?? rule.name,
      description: rule.description,
      app: options.app ?? null,
      milestone: options.milestone,
      skip: options.inheritedSkip ?? this.#skipOf(rule.when),
      runtimeWhen: changed ? { changed } : null,
      allowFailure: (options.allowFailure ?? false) || rule.allowFailure,
      timeoutSeconds: options.timeoutSeconds === undefined ? rule.timeoutSeconds : options.timeoutSeconds,
      steps: rule.steps.map((step) => this.#shellStep(step, options.id, options.env)),
    };
  }

  #shellStep(step: PipelineStepRule, stageId: string, env: Record<string, string>): PipelinePlanShellStep {
    for (const name of step.secrets) this.#secrets.add(name);
    return {
      id: `${stageId}/${step.localId}`,
      name: step.name,
      timeoutSeconds: step.timeoutSeconds,
      retry: step.retry,
      allowFailure: step.allowFailure,
      kind: "sh",
      run: step.run,
      cwd: step.cwd,
      env: { ...env, ...step.env },
      secrets: step.secrets,
      skipExitCodes: step.skipExitCodes,
    };
  }

  #post(rule: PipelinePostRule | undefined, env: Record<string, string>): PipelinePlanPost {
    const steps = (result: keyof PipelinePlanPost) =>
      (rule?.[result] ?? []).map((step) => this.#shellStep(step, `post.${result}`, env));
    return {
      success: steps("success"),
      failure: steps("failure"),
      canceled: steps("canceled"),
      always: steps("always"),
    };
  }

  #skipOf(when: PipelineWhenRule): PipelineSkip | null {
    const { branch, trigger } = this.#input.context;
    const skip = (reason: string) => ({ reason: PipelineInputReader.clip(reason, PipelineCompiler.#reasonChars) });
    if (when.branch && !PipelinePattern.matches(when.branch, branch))
      return skip(`branch "${branch}" does not match ${when.branch.map((glob) => `"${glob}"`).join(", ")}`);
    if (when.trigger && !when.trigger.includes(trigger))
      return skip(`trigger "${trigger}" is not ${when.trigger.map((name) => `"${name}"`).join(" or ")}`);
    return null;
  }

  #sources(): PipelinePlan["sources"] {
    const { workspace, apps, context } = this.#input;
    const sourceOf = (source: PipelineSourceFile<unknown>): PipelinePlanSource => ({
      file: source.file,
      sha256: source.sha256,
      declared: source.pipeline != null,
    });
    return {
      workspace: workspace ? sourceOf(workspace) : null,
      apps: Object.fromEntries(
        context.apps.flatMap((app) => {
          const source = apps.get(app);
          return source ? [[app, sourceOf(source)]] : [];
        }),
      ),
    };
  }

  #hasErrors() {
    return this.#diagnostics.some((diagnostic) => diagnostic.severity === "error");
  }

  #failed(): PipelinePlanResult {
    return { ok: false, plan: null, diagnostics: this.#diagnostics };
  }

  #error(code: string, message: string, file: string | null, path: string | null) {
    this.#diagnostics.push({ severity: "error", code, message, file, path });
  }

  #warning(code: string, message: string, file: string | null, path: string | null) {
    this.#diagnostics.push({ severity: "warning", code, message, file, path });
  }
}

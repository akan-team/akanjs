import { PipelineNames } from "./PipelineNames";
import { PipelinePattern } from "./PipelinePattern";
import { type PipelineValueProblem, PipelineValueReader } from "./PipelineValueReader";
import {
  type PipelineActionName,
  type PipelineDiagnostic,
  type PipelinePlan,
  type PipelinePlanActionStep,
  type PipelinePlanContext,
  type PipelinePlanOtaStep,
  type PipelinePlanPhase,
  type PipelinePlanPost,
  type PipelinePlanResult,
  type PipelinePlanRetry,
  type PipelinePlanShellStep,
  type PipelinePlanSource,
  type PipelinePlanStage,
  type PipelinePlanStep,
  pipelineActionNames,
  pipelineActions,
  pipelineMilestones,
  pipelineOtaPlatforms,
  pipelinePlanLimits,
  pipelinePlanSlots,
  pipelinePlanVersion,
  pipelineTriggers,
} from "./pipelinePlan";

type JsonObject = Record<string, unknown>;

/** Strict: an unknown key, kind, action or version is refused, never ignored. Structure only, no executor policy. */
export class PipelinePlanSchema {
  static readonly #stageIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*(?:[:.][A-Za-z0-9][A-Za-z0-9_-]*)*$/;
  static readonly #stepIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;
  static readonly #sha256Pattern = /^[0-9a-f]{64}$/;
  static readonly #idChars = 256;
  static readonly #maxSeconds = 86_400;
  static readonly #shellKeys = Object.keys({
    id: true,
    name: true,
    timeoutSeconds: true,
    retry: true,
    allowFailure: true,
    kind: true,
    run: true,
    cwd: true,
    env: true,
    secrets: true,
    skipExitCodes: true,
  } satisfies { [key in keyof PipelinePlanShellStep]: true });
  static readonly #actionKeys = Object.keys({
    id: true,
    name: true,
    timeoutSeconds: true,
    retry: true,
    allowFailure: true,
    kind: true,
    action: true,
    actionVersion: true,
    with: true,
  } satisfies { [key in keyof PipelinePlanActionStep]: true });

  /** What an executor reads off `--out`: the size is checked before the text is parsed. */
  static parseText(text: string): PipelinePlanResult {
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > pipelinePlanLimits.planBytes)
      throw new Error(`pipeline plan: ${bytes} bytes is over the ${pipelinePlanLimits.planBytes}-byte limit`);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      throw new Error(`pipeline plan: not JSON (${error instanceof Error ? error.message : String(error)})`);
    }
    return PipelinePlanSchema.parseResult(value);
  }

  static parseResult(value: unknown): PipelinePlanResult {
    return new PipelinePlanSchema().#result(value);
  }

  static parse(value: unknown): PipelinePlan {
    return new PipelinePlanSchema().#plan(value, "plan");
  }

  readonly #phaseIds = new Set<string>();
  readonly #stageIds = new Set<string>();
  readonly #stepIds = new Set<string>();
  readonly #stepSecrets = new Set<string>();
  #apps = new Set<string>();
  #stageCount = 0;
  #stepCount = 0;
  readonly #read = new PipelineValueReader<never>("plan", (path, problem) =>
    this.#fail(path, PipelinePlanSchema.#reason(problem)),
  );

  #result(value: unknown): PipelinePlanResult {
    const result = this.#read.object(value, "result", ["ok", "plan", "diagnostics"]);
    const ok = this.#read.boolean(result.ok, "result.ok");
    const diagnostics = this.#read
      .list(result.diagnostics, "result.diagnostics")
      .map((item, idx) => this.#diagnostic(item, `result.diagnostics[${idx}]`));
    if (ok) return { ok, plan: this.#plan(result.plan, "result.plan"), diagnostics };
    if (result.plan !== null) this.#fail("result.plan", "must be null when ok is false");
    if (!diagnostics.some((diagnostic) => diagnostic.severity === "error"))
      this.#fail("result.diagnostics", "must hold an error when ok is false");
    return { ok, plan: null, diagnostics };
  }

  #diagnostic(value: unknown, path: string): PipelineDiagnostic {
    const diagnostic = this.#read.object(value, path, ["severity", "code", "message", "file", "path"]);
    return {
      severity: this.#read.oneOf(diagnostic.severity, `${path}.severity`, ["error", "warning"] as const),
      code: this.#read.string(diagnostic.code, `${path}.code`),
      message: this.#read.string(diagnostic.message, `${path}.message`, pipelinePlanLimits.shBytes),
      file: this.#nullable(diagnostic.file, (file) => this.#read.string(file, `${path}.file`)),
      path: this.#nullable(diagnostic.path, (where) => this.#read.string(where, `${path}.path`)),
    };
  }

  #plan(value: unknown, path: string): PipelinePlan {
    const plan = this.#read.object(value, path, [
      "schemaVersion",
      "sources",
      "planner",
      "context",
      "appOrder",
      "timeoutSeconds",
      "requiredSecrets",
      "phases",
      "post",
    ]);
    if (plan.schemaVersion !== pipelinePlanVersion)
      this.#fail(
        `${path}.schemaVersion`,
        `${JSON.stringify(plan.schemaVersion)} is not version ${pipelinePlanVersion}`,
      );
    const context = this.#context(plan.context, `${path}.context`);
    this.#apps = new Set(context.apps);
    const appOrder = this.#stringList(plan.appOrder, `${path}.appOrder`);
    if (
      appOrder.length !== context.apps.length ||
      new Set(appOrder).size !== appOrder.length ||
      appOrder.some((app) => !this.#apps.has(app))
    )
      this.#fail(`${path}.appOrder`, "must order exactly the apps of context.apps");
    const planner = this.#read.object(plan.planner, `${path}.planner`, ["akanVersion"]);
    const sources = this.#sources(plan.sources, `${path}.sources`);
    const phaseList = this.#read.list(plan.phases, `${path}.phases`);
    if (phaseList.length > pipelinePlanLimits.phases)
      this.#fail(`${path}.phases`, `holds at most ${pipelinePlanLimits.phases} items`);
    const phases = phaseList.map((phase, idx) => this.#phase(phase, `${path}.phases[${idx}]`));
    const post = this.#post(plan.post, `${path}.post`);
    const requiredSecrets = this.#secretList(plan.requiredSecrets, `${path}.requiredSecrets`);
    if (
      requiredSecrets.length !== this.#stepSecrets.size ||
      requiredSecrets.some((name) => !this.#stepSecrets.has(name))
    )
      this.#fail(`${path}.requiredSecrets`, "must list exactly the secrets its steps name");
    return {
      schemaVersion: pipelinePlanVersion,
      sources,
      planner: { akanVersion: this.#read.string(planner.akanVersion, `${path}.planner.akanVersion`) },
      context,
      appOrder,
      timeoutSeconds: this.#seconds(plan.timeoutSeconds, `${path}.timeoutSeconds`),
      requiredSecrets,
      phases,
      post,
    };
  }

  #sources(value: unknown, path: string): PipelinePlan["sources"] {
    const sources = this.#read.object(value, path, ["workspace", "apps"]);
    const apps = this.#read.object(sources.apps, `${path}.apps`);
    return {
      workspace: this.#nullable(sources.workspace, (source) => this.#source(source, `${path}.workspace`)),
      apps: Object.fromEntries(
        Object.entries(apps).map(([app, source]) => [app, this.#source(source, `${path}.apps.${app}`)]),
      ),
    };
  }

  #source(value: unknown, path: string): PipelinePlanSource {
    const source = this.#read.object(value, path, ["file", "sha256", "declared"]);
    const sha256 = this.#read.string(source.sha256, `${path}.sha256`);
    if (!PipelinePlanSchema.#sha256Pattern.test(sha256)) this.#fail(`${path}.sha256`, "must be a lowercase sha256");
    return {
      file: this.#read.string(source.file, `${path}.file`),
      sha256,
      declared: this.#read.boolean(source.declared, `${path}.declared`),
    };
  }

  #context(value: unknown, path: string): PipelinePlanContext {
    const context = this.#read.object(value, path, ["branch", "env", "apps", "trigger", "buildNum", "commit"]);
    const apps = this.#stringList(context.apps, `${path}.apps`);
    if (new Set(apps).size !== apps.length) this.#fail(`${path}.apps`, "lists an app twice");
    return {
      branch: this.#read.string(context.branch, `${path}.branch`),
      env: this.#read.string(context.env, `${path}.env`),
      apps,
      trigger: this.#read.oneOf(context.trigger, `${path}.trigger`, pipelineTriggers),
      buildNum: this.#read.int(context.buildNum, `${path}.buildNum`, 0),
      commit: this.#nullable(context.commit, (commit) => this.#read.string(commit, `${path}.commit`)),
    };
  }

  #phase(value: unknown, path: string): PipelinePlanPhase {
    const phase = this.#read.object(value, path, [
      "id",
      "name",
      "description",
      "slot",
      "milestone",
      "action",
      "order",
      "maxParallel",
      "failFast",
      "timeoutSeconds",
      "stages",
    ]);
    const id = this.#read.string(phase.id, `${path}.id`);
    const idError = PipelineNames.idError(id);
    if (idError) this.#fail(`${path}.id`, idError);
    if (this.#phaseIds.has(id)) this.#fail(`${path}.id`, `"${id}" is the id of another phase`);
    this.#phaseIds.add(id);
    const slot = this.#read.oneOf(phase.slot, `${path}.slot`, pipelinePlanSlots);
    const action = this.#nullable(phase.action, (name) =>
      this.#read.oneOf(name, `${path}.action`, pipelineActionNames),
    );
    const order = this.#read.oneOf(phase.order, `${path}.order`, ["parallel", "sequential"] as const);
    if (action && slot !== action) this.#fail(`${path}.slot`, `a ${action} phase sits in the "${action}" slot`);
    if (!action && (pipelineActionNames as readonly string[]).includes(slot))
      this.#fail(`${path}.slot`, `the "${slot}" slot holds the ${slot} action phase only`);
    if (action === "deploy" && order !== "sequential")
      this.#fail(`${path}.order`, "a deploy phase runs its apps one at a time");
    const stages = this.#read
      .list(phase.stages, `${path}.stages`)
      .map((stage, idx) => this.#stage(stage, `${path}.stages[${idx}]`, action));
    if (!stages.length) this.#fail(`${path}.stages`, "a phase holds at least one stage");
    return {
      id,
      name: this.#read.string(phase.name, `${path}.name`, pipelinePlanLimits.nameChars),
      description: this.#description(phase.description, `${path}.description`),
      slot,
      milestone: this.#read.oneOf(phase.milestone, `${path}.milestone`, pipelineMilestones),
      action,
      order,
      maxParallel: this.#nullable(phase.maxParallel, (limit) => this.#read.int(limit, `${path}.maxParallel`, 1)),
      failFast: this.#read.boolean(phase.failFast, `${path}.failFast`),
      timeoutSeconds: this.#seconds(phase.timeoutSeconds, `${path}.timeoutSeconds`),
      stages,
    };
  }

  #stage(value: unknown, path: string, action: PipelineActionName | null): PipelinePlanStage {
    const stage = this.#read.object(value, path, [
      "id",
      "name",
      "description",
      "app",
      "milestone",
      "skip",
      "runtimeWhen",
      "allowFailure",
      "timeoutSeconds",
      "steps",
    ]);
    this.#stageCount += 1;
    if (this.#stageCount > pipelinePlanLimits.stages)
      this.#fail(path, `a plan holds at most ${pipelinePlanLimits.stages} stages`);
    const id = this.#read.string(stage.id, `${path}.id`, PipelinePlanSchema.#idChars);
    if (!PipelinePlanSchema.#stageIdPattern.test(id)) this.#fail(`${path}.id`, `"${id}" is not a stage id`);
    if (this.#stageIds.has(id)) this.#fail(`${path}.id`, `"${id}" is the id of another stage`);
    this.#stageIds.add(id);
    const app = this.#nullable(stage.app, (name) => this.#read.string(name, `${path}.app`));
    if (app !== null && !this.#apps.has(app)) this.#fail(`${path}.app`, `"${app}" is not in context.apps`);
    const steps = this.#read
      .list(stage.steps, `${path}.steps`)
      .map((step, idx) => this.#step(step, `${path}.steps[${idx}]`));
    if (!steps.length) this.#fail(`${path}.steps`, "a stage holds at least one step");
    if (action) {
      const [step] = steps;
      if (steps.length !== 1 || step?.kind !== "action" || step.action !== action || step.with.app !== app)
        this.#fail(`${path}.steps`, `a ${action} stage holds exactly one ${action} action, for the stage's own app`);
    } else if (steps.some((step) => step.kind === "action"))
      this.#fail(`${path}.steps`, "an action runs in its own action phase only");
    return {
      id,
      name: this.#read.string(stage.name, `${path}.name`, pipelinePlanLimits.nameChars),
      description: this.#description(stage.description, `${path}.description`),
      app,
      milestone: this.#read.oneOf(stage.milestone, `${path}.milestone`, pipelineMilestones),
      skip: this.#nullable(stage.skip, (skip) => {
        const reason = this.#read.object(skip, `${path}.skip`, ["reason"]).reason;
        return { reason: this.#read.string(reason, `${path}.skip.reason`) };
      }),
      runtimeWhen: this.#nullable(stage.runtimeWhen, (when) => {
        const changed = this.#read.object(when, `${path}.runtimeWhen`, ["changed"]).changed;
        return { changed: this.#patterns(changed, `${path}.runtimeWhen.changed`) };
      }),
      allowFailure: this.#read.boolean(stage.allowFailure, `${path}.allowFailure`),
      timeoutSeconds: this.#seconds(stage.timeoutSeconds, `${path}.timeoutSeconds`),
      steps,
    };
  }

  #step(value: unknown, path: string): PipelinePlanStep {
    const kind = this.#read.oneOf(this.#read.object(value, path).kind, `${path}.kind`, ["sh", "action"] as const);
    const step = this.#read.object(
      value,
      path,
      kind === "sh" ? PipelinePlanSchema.#shellKeys : PipelinePlanSchema.#actionKeys,
    );
    this.#stepCount += 1;
    if (this.#stepCount > pipelinePlanLimits.steps)
      this.#fail(path, `a plan holds at most ${pipelinePlanLimits.steps} steps`);
    const id = this.#read.string(step.id, `${path}.id`, PipelinePlanSchema.#idChars);
    if (!PipelinePlanSchema.#stepIdPattern.test(id)) this.#fail(`${path}.id`, `"${id}" is not a step id`);
    if (this.#stepIds.has(id)) this.#fail(`${path}.id`, `"${id}" is the id of another step`);
    this.#stepIds.add(id);
    const base = {
      id,
      name: this.#read.string(step.name, `${path}.name`, pipelinePlanLimits.nameChars),
      timeoutSeconds: this.#seconds(step.timeoutSeconds, `${path}.timeoutSeconds`),
      retry: this.#nullable(step.retry, (retry) => this.#retry(retry, `${path}.retry`)),
      allowFailure: this.#read.boolean(step.allowFailure, `${path}.allowFailure`),
    };
    return kind === "sh" ? this.#shell(step, path, base) : this.#action(step, path, base);
  }

  #shell(
    step: JsonObject,
    path: string,
    base: Omit<PipelinePlanShellStep, "kind" | "run" | "cwd" | "env" | "secrets" | "skipExitCodes">,
  ): PipelinePlanShellStep {
    const run = this.#read.string(step.run, `${path}.run`, Number.POSITIVE_INFINITY);
    if (new TextEncoder().encode(run).length > pipelinePlanLimits.shBytes)
      this.#fail(`${path}.run`, `a script is at most ${pipelinePlanLimits.shBytes} bytes`);
    const cwd = this.#read.string(step.cwd, `${path}.cwd`);
    if (cwd.startsWith("/") || cwd.startsWith("~") || cwd.includes("\\") || cwd.split("/").includes(".."))
      this.#fail(`${path}.cwd`, `"${cwd}" is not a path inside the workspace`);
    const env = this.#read.object(step.env, `${path}.env`);
    for (const [name, envValue] of Object.entries(env)) {
      const nameError = PipelineNames.envNameError(name);
      if (nameError) this.#fail(`${path}.env`, nameError);
      this.#read.string(envValue, `${path}.env.${name}`, pipelinePlanLimits.shBytes, { allowEmpty: true });
    }
    const secrets = this.#secretList(step.secrets, `${path}.secrets`);
    for (const name of secrets) this.#stepSecrets.add(name);
    const skipExitCodes = this.#read
      .list(step.skipExitCodes, `${path}.skipExitCodes`)
      .map((code, idx) => this.#read.int(code, `${path}.skipExitCodes[${idx}]`, 1, 255));
    if (new Set(skipExitCodes).size !== skipExitCodes.length) this.#fail(`${path}.skipExitCodes`, "lists a code twice");
    return { ...base, kind: "sh", run, cwd, env: env as Record<string, string>, secrets, skipExitCodes };
  }

  #action(
    step: JsonObject,
    path: string,
    base: Omit<PipelinePlanActionStep, "kind" | "action" | "actionVersion" | "with">,
  ): PipelinePlanActionStep {
    const action = this.#read.oneOf(step.action, `${path}.action`, pipelineActionNames);
    if (step.actionVersion !== pipelineActions[action].version)
      this.#fail(`${path}.actionVersion`, `${JSON.stringify(step.actionVersion)} is not a version of ${action}`);
    const actionVersion = pipelineActions[action].version;
    if (action === "ota")
      return { ...base, kind: "action", action, actionVersion, with: this.#otaWith(step.with, path) };
    const app = this.#read.object(step.with, `${path}.with`, ["app"]).app;
    return {
      ...base,
      kind: "action",
      action,
      actionVersion,
      with: { app: this.#read.string(app, `${path}.with.app`) },
    };
  }

  #otaWith(value: unknown, path: string): PipelinePlanOtaStep["with"] {
    const raw = this.#read.object(value, `${path}.with`, ["app", "targets", "platforms"]);
    const targets = this.#stringList(raw.targets, `${path}.with.targets`);
    const platforms = this.#read
      .list(raw.platforms, `${path}.with.platforms`)
      .map((platform, idx) => this.#read.oneOf(platform, `${path}.with.platforms[${idx}]`, pipelineOtaPlatforms));
    for (const [key, list] of [
      ["targets", targets],
      ["platforms", platforms],
    ] as const) {
      if (!list.length) this.#fail(`${path}.with.${key}`, "may not be empty");
      if (new Set(list).size !== list.length) this.#fail(`${path}.with.${key}`, "lists one twice");
    }
    return { app: this.#read.string(raw.app, `${path}.with.app`), targets, platforms };
  }

  #post(value: unknown, path: string): PipelinePlanPost {
    const post = this.#read.object(value, path, ["success", "failure", "canceled", "always"]);
    const steps = (result: keyof PipelinePlanPost) =>
      this.#read.list(post[result], `${path}.${result}`).map((step, idx) => {
        const parsed = this.#step(step, `${path}.${result}[${idx}]`);
        if (parsed.kind !== "sh") this.#fail(`${path}.${result}[${idx}]`, "a post step is a shell step");
        return parsed;
      });
    return {
      success: steps("success"),
      failure: steps("failure"),
      canceled: steps("canceled"),
      always: steps("always"),
    };
  }

  #retry(value: unknown, path: string): PipelinePlanRetry {
    const retry = this.#read.object(value, path, ["attempts", "delaySeconds"]);
    return {
      attempts: this.#read.int(retry.attempts, `${path}.attempts`, 1, pipelinePlanLimits.retryAttempts),
      delaySeconds: this.#read.int(retry.delaySeconds, `${path}.delaySeconds`, 0, pipelinePlanLimits.retryDelaySeconds),
    };
  }

  #patterns(value: unknown, path: string) {
    const patterns = this.#stringList(value, path);
    const patternError = PipelinePattern.validate(patterns);
    if (patternError) this.#fail(path, patternError);
    return patterns;
  }

  #secretList(value: unknown, path: string) {
    const names = this.#stringList(value, path);
    for (const [idx, name] of names.entries()) {
      const nameError = PipelineNames.secretNameError(name);
      if (nameError) this.#fail(`${path}[${idx}]`, nameError);
    }
    if (new Set(names).size !== names.length) this.#fail(path, "lists a secret twice");
    return names;
  }

  #stringList(value: unknown, path: string) {
    return this.#read.list(value, path).map((item, idx) => this.#read.string(item, `${path}[${idx}]`));
  }

  #description(value: unknown, path: string) {
    return this.#nullable(value, (text) => this.#read.string(text, path, pipelinePlanLimits.descriptionChars));
  }

  #seconds(value: unknown, path: string) {
    return this.#nullable(value, (seconds) => this.#read.int(seconds, path, 1, PipelinePlanSchema.#maxSeconds));
  }

  #nullable<T>(value: unknown, parse: (value: unknown) => T): T | null {
    return value === null ? null : parse(value);
  }

  #fail(path: string, reason: string): never {
    throw new Error(`pipeline plan ${path}: ${reason}`);
  }

  static #reason(problem: PipelineValueProblem): string {
    switch (problem.kind) {
      case "object":
        return "must be an object";
      case "unknownKey":
        return `"${problem.key}" is not a known key`;
      case "missingKey":
        return `"${problem.key}" is missing`;
      case "list":
        return "must be an array";
      case "string":
        return "must be a string";
      case "empty":
        return "may not be empty";
      case "length":
        return `is longer than ${problem.max} characters`;
      case "boolean":
        return "must be a boolean";
      case "int":
        return "must be an integer";
      case "range":
        return `must be between ${problem.min} and ${problem.max}`;
      case "oneOf":
        return `${JSON.stringify(problem.value)} is not one of ${problem.options.join(", ")}`;
    }
  }
}

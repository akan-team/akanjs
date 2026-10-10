import { PipelineNames } from "./PipelineNames";
import { PipelinePattern } from "./PipelinePattern";
import {
  type PipelineActionName,
  type PipelineDiagnostic,
  type PipelinePlan,
  type PipelinePlanActionStep,
  type PipelinePlanContext,
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
  static readonly #textChars = 1024;
  static readonly #maxSeconds = 86_400;
  static readonly #shellKeys = [
    "id",
    "name",
    "timeoutSeconds",
    "retry",
    "allowFailure",
    "kind",
    "run",
    "cwd",
    "env",
    "secrets",
    "skipExitCodes",
  ] as const;
  static readonly #actionKeys = [
    "id",
    "name",
    "timeoutSeconds",
    "retry",
    "allowFailure",
    "kind",
    "action",
    "actionVersion",
    "with",
  ] as const;

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

  #result(value: unknown): PipelinePlanResult {
    const result = this.#object(value, "result", ["ok", "plan", "diagnostics"]);
    const ok = this.#boolean(result.ok, "result.ok");
    const diagnostics = this.#array(result.diagnostics, "result.diagnostics").map((item, idx) =>
      this.#diagnostic(item, `result.diagnostics[${idx}]`),
    );
    if (ok) return { ok, plan: this.#plan(result.plan, "result.plan"), diagnostics };
    if (result.plan !== null) this.#fail("result.plan", "must be null when ok is false");
    if (!diagnostics.some((diagnostic) => diagnostic.severity === "error"))
      this.#fail("result.diagnostics", "must hold an error when ok is false");
    return { ok, plan: null, diagnostics };
  }

  #diagnostic(value: unknown, path: string): PipelineDiagnostic {
    const diagnostic = this.#object(value, path, ["severity", "code", "message", "file", "path"]);
    return {
      severity: this.#oneOf(diagnostic.severity, `${path}.severity`, ["error", "warning"] as const),
      code: this.#string(diagnostic.code, `${path}.code`),
      message: this.#string(diagnostic.message, `${path}.message`, pipelinePlanLimits.shBytes),
      file: this.#nullable(diagnostic.file, (file) => this.#string(file, `${path}.file`)),
      path: this.#nullable(diagnostic.path, (where) => this.#string(where, `${path}.path`)),
    };
  }

  #plan(value: unknown, path: string): PipelinePlan {
    const plan = this.#object(value, path, [
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
    const planner = this.#object(plan.planner, `${path}.planner`, ["akanVersion"]);
    const sources = this.#sources(plan.sources, `${path}.sources`);
    const phases = this.#array(plan.phases, `${path}.phases`, pipelinePlanLimits.phases).map((phase, idx) =>
      this.#phase(phase, `${path}.phases[${idx}]`),
    );
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
      planner: { akanVersion: this.#string(planner.akanVersion, `${path}.planner.akanVersion`) },
      context,
      appOrder,
      timeoutSeconds: this.#seconds(plan.timeoutSeconds, `${path}.timeoutSeconds`),
      requiredSecrets,
      phases,
      post,
    };
  }

  #sources(value: unknown, path: string): PipelinePlan["sources"] {
    const sources = this.#object(value, path, ["workspace", "apps"]);
    const apps = this.#object(sources.apps, `${path}.apps`);
    return {
      workspace: this.#nullable(sources.workspace, (source) => this.#source(source, `${path}.workspace`)),
      apps: Object.fromEntries(
        Object.entries(apps).map(([app, source]) => [app, this.#source(source, `${path}.apps.${app}`)]),
      ),
    };
  }

  #source(value: unknown, path: string): PipelinePlanSource {
    const source = this.#object(value, path, ["file", "sha256", "declared"]);
    const sha256 = this.#string(source.sha256, `${path}.sha256`);
    if (!PipelinePlanSchema.#sha256Pattern.test(sha256)) this.#fail(`${path}.sha256`, "must be a lowercase sha256");
    return {
      file: this.#string(source.file, `${path}.file`),
      sha256,
      declared: this.#boolean(source.declared, `${path}.declared`),
    };
  }

  #context(value: unknown, path: string): PipelinePlanContext {
    const context = this.#object(value, path, ["branch", "env", "apps", "trigger", "buildNum", "commit"]);
    const apps = this.#stringList(context.apps, `${path}.apps`);
    if (new Set(apps).size !== apps.length) this.#fail(`${path}.apps`, "lists an app twice");
    return {
      branch: this.#string(context.branch, `${path}.branch`),
      env: this.#string(context.env, `${path}.env`),
      apps,
      trigger: this.#oneOf(context.trigger, `${path}.trigger`, pipelineTriggers),
      buildNum: this.#int(context.buildNum, `${path}.buildNum`, 0),
      commit: this.#nullable(context.commit, (commit) => this.#string(commit, `${path}.commit`)),
    };
  }

  #phase(value: unknown, path: string): PipelinePlanPhase {
    const phase = this.#object(value, path, [
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
    const id = this.#string(phase.id, `${path}.id`);
    const idError = PipelineNames.idError(id);
    if (idError) this.#fail(`${path}.id`, idError);
    if (this.#phaseIds.has(id)) this.#fail(`${path}.id`, `"${id}" is the id of another phase`);
    this.#phaseIds.add(id);
    const slot = this.#oneOf(phase.slot, `${path}.slot`, pipelinePlanSlots);
    const action = this.#nullable(phase.action, (name) => this.#oneOf(name, `${path}.action`, pipelineActionNames));
    const order = this.#oneOf(phase.order, `${path}.order`, ["parallel", "sequential"] as const);
    if (action && slot !== action) this.#fail(`${path}.slot`, `a ${action} phase sits in the "${action}" slot`);
    if (!action && (pipelineActionNames as readonly string[]).includes(slot))
      this.#fail(`${path}.slot`, `the "${slot}" slot holds the ${slot} action phase only`);
    if (action === "deploy" && order !== "sequential")
      this.#fail(`${path}.order`, "a deploy phase runs its apps one at a time");
    const stages = this.#array(phase.stages, `${path}.stages`).map((stage, idx) =>
      this.#stage(stage, `${path}.stages[${idx}]`, action),
    );
    if (!stages.length) this.#fail(`${path}.stages`, "a phase holds at least one stage");
    return {
      id,
      name: this.#string(phase.name, `${path}.name`, pipelinePlanLimits.nameChars),
      description: this.#description(phase.description, `${path}.description`),
      slot,
      milestone: this.#oneOf(phase.milestone, `${path}.milestone`, pipelineMilestones),
      action,
      order,
      maxParallel: this.#nullable(phase.maxParallel, (limit) => this.#int(limit, `${path}.maxParallel`, 1)),
      failFast: this.#boolean(phase.failFast, `${path}.failFast`),
      timeoutSeconds: this.#seconds(phase.timeoutSeconds, `${path}.timeoutSeconds`),
      stages,
    };
  }

  #stage(value: unknown, path: string, action: PipelineActionName | null): PipelinePlanStage {
    const stage = this.#object(value, path, [
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
    const id = this.#string(stage.id, `${path}.id`, PipelinePlanSchema.#idChars);
    if (!PipelinePlanSchema.#stageIdPattern.test(id)) this.#fail(`${path}.id`, `"${id}" is not a stage id`);
    if (this.#stageIds.has(id)) this.#fail(`${path}.id`, `"${id}" is the id of another stage`);
    this.#stageIds.add(id);
    const app = this.#nullable(stage.app, (name) => this.#string(name, `${path}.app`));
    if (app !== null && !this.#apps.has(app)) this.#fail(`${path}.app`, `"${app}" is not in context.apps`);
    const steps = this.#array(stage.steps, `${path}.steps`).map((step, idx) =>
      this.#step(step, `${path}.steps[${idx}]`),
    );
    if (!steps.length) this.#fail(`${path}.steps`, "a stage holds at least one step");
    if (action) {
      const [step] = steps;
      if (steps.length !== 1 || step?.kind !== "action" || step.action !== action || step.with.app !== app)
        this.#fail(`${path}.steps`, `a ${action} stage holds exactly one ${action} action, for the stage's own app`);
    } else if (steps.some((step) => step.kind === "action"))
      this.#fail(`${path}.steps`, "an action runs in its own action phase only");
    return {
      id,
      name: this.#string(stage.name, `${path}.name`, pipelinePlanLimits.nameChars),
      description: this.#description(stage.description, `${path}.description`),
      app,
      milestone: this.#oneOf(stage.milestone, `${path}.milestone`, pipelineMilestones),
      skip: this.#nullable(stage.skip, (skip) => {
        const reason = this.#object(skip, `${path}.skip`, ["reason"]).reason;
        return { reason: this.#string(reason, `${path}.skip.reason`) };
      }),
      runtimeWhen: this.#nullable(stage.runtimeWhen, (when) => {
        const changed = this.#object(when, `${path}.runtimeWhen`, ["changed"]).changed;
        return { changed: this.#patterns(changed, `${path}.runtimeWhen.changed`) };
      }),
      allowFailure: this.#boolean(stage.allowFailure, `${path}.allowFailure`),
      timeoutSeconds: this.#seconds(stage.timeoutSeconds, `${path}.timeoutSeconds`),
      steps,
    };
  }

  #step(value: unknown, path: string): PipelinePlanStep {
    const kind = this.#oneOf(this.#object(value, path).kind, `${path}.kind`, ["sh", "action"] as const);
    const step = this.#object(
      value,
      path,
      kind === "sh" ? PipelinePlanSchema.#shellKeys : PipelinePlanSchema.#actionKeys,
    );
    this.#stepCount += 1;
    if (this.#stepCount > pipelinePlanLimits.steps)
      this.#fail(path, `a plan holds at most ${pipelinePlanLimits.steps} steps`);
    const id = this.#string(step.id, `${path}.id`, PipelinePlanSchema.#idChars);
    if (!PipelinePlanSchema.#stepIdPattern.test(id)) this.#fail(`${path}.id`, `"${id}" is not a step id`);
    if (this.#stepIds.has(id)) this.#fail(`${path}.id`, `"${id}" is the id of another step`);
    this.#stepIds.add(id);
    const base = {
      id,
      name: this.#string(step.name, `${path}.name`, pipelinePlanLimits.nameChars),
      timeoutSeconds: this.#seconds(step.timeoutSeconds, `${path}.timeoutSeconds`),
      retry: this.#nullable(step.retry, (retry) => this.#retry(retry, `${path}.retry`)),
      allowFailure: this.#boolean(step.allowFailure, `${path}.allowFailure`),
    };
    return kind === "sh" ? this.#shell(step, path, base) : this.#action(step, path, base);
  }

  #shell(
    step: JsonObject,
    path: string,
    base: Omit<PipelinePlanShellStep, "kind" | "run" | "cwd" | "env" | "secrets" | "skipExitCodes">,
  ): PipelinePlanShellStep {
    const run = this.#string(step.run, `${path}.run`, Number.POSITIVE_INFINITY);
    if (new TextEncoder().encode(run).length > pipelinePlanLimits.shBytes)
      this.#fail(`${path}.run`, `a script is at most ${pipelinePlanLimits.shBytes} bytes`);
    const cwd = this.#string(step.cwd, `${path}.cwd`);
    if (cwd.startsWith("/") || cwd.startsWith("~") || cwd.includes("\\") || cwd.split("/").includes(".."))
      this.#fail(`${path}.cwd`, `"${cwd}" is not a path inside the workspace`);
    const env = this.#object(step.env, `${path}.env`);
    for (const [name, envValue] of Object.entries(env)) {
      const nameError = PipelineNames.envNameError(name);
      if (nameError) this.#fail(`${path}.env`, nameError);
      this.#string(envValue, `${path}.env.${name}`, pipelinePlanLimits.shBytes, { allowEmpty: true });
    }
    const secrets = this.#secretList(step.secrets, `${path}.secrets`);
    for (const name of secrets) this.#stepSecrets.add(name);
    const skipExitCodes = this.#array(step.skipExitCodes, `${path}.skipExitCodes`).map((code, idx) =>
      this.#int(code, `${path}.skipExitCodes[${idx}]`, 1, 255),
    );
    if (new Set(skipExitCodes).size !== skipExitCodes.length) this.#fail(`${path}.skipExitCodes`, "lists a code twice");
    return { ...base, kind: "sh", run, cwd, env: env as Record<string, string>, secrets, skipExitCodes };
  }

  #action(
    step: JsonObject,
    path: string,
    base: Omit<PipelinePlanActionStep, "kind" | "action" | "actionVersion" | "with">,
  ): PipelinePlanActionStep {
    const action = this.#oneOf(step.action, `${path}.action`, pipelineActionNames);
    if (step.actionVersion !== pipelineActions[action].version)
      this.#fail(`${path}.actionVersion`, `${JSON.stringify(step.actionVersion)} is not a version of ${action}`);
    const app = this.#object(step.with, `${path}.with`, ["app"]).app;
    return {
      ...base,
      kind: "action",
      action,
      actionVersion: pipelineActions[action].version,
      with: { app: this.#string(app, `${path}.with.app`) },
    };
  }

  #post(value: unknown, path: string): PipelinePlanPost {
    const post = this.#object(value, path, ["success", "failure", "canceled", "always"]);
    const steps = (result: keyof PipelinePlanPost) =>
      this.#array(post[result], `${path}.${result}`).map((step, idx) => {
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
    const retry = this.#object(value, path, ["attempts", "delaySeconds"]);
    return {
      attempts: this.#int(retry.attempts, `${path}.attempts`, 1, pipelinePlanLimits.retryAttempts),
      delaySeconds: this.#int(retry.delaySeconds, `${path}.delaySeconds`, 0, pipelinePlanLimits.retryDelaySeconds),
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
    for (const name of names) {
      const nameError = PipelineNames.secretNameError(name);
      if (nameError) this.#fail(path, nameError);
    }
    if (new Set(names).size !== names.length) this.#fail(path, "lists a secret twice");
    return names;
  }

  #stringList(value: unknown, path: string) {
    return this.#array(value, path).map((item, idx) => this.#string(item, `${path}[${idx}]`));
  }

  #description(value: unknown, path: string) {
    return this.#nullable(value, (text) => this.#string(text, path, pipelinePlanLimits.descriptionChars));
  }

  #seconds(value: unknown, path: string) {
    return this.#nullable(value, (seconds) => this.#int(seconds, path, 1, PipelinePlanSchema.#maxSeconds));
  }

  #nullable<T>(value: unknown, parse: (value: unknown) => T): T | null {
    return value === null ? null : parse(value);
  }

  #object(value: unknown, path: string, keys?: readonly string[]): JsonObject {
    if (typeof value !== "object" || value === null || Array.isArray(value)) this.#fail(path, "must be an object");
    const object = value as JsonObject;
    if (!keys) return object;
    for (const key of Object.keys(object)) if (!keys.includes(key)) this.#fail(path, `"${key}" is not a known key`);
    for (const key of keys) if (!(key in object)) this.#fail(path, `"${key}" is missing`);
    return object;
  }

  #array(value: unknown, path: string, max = Number.POSITIVE_INFINITY): unknown[] {
    if (!Array.isArray(value)) this.#fail(path, "must be an array");
    const items = value as unknown[];
    if (items.length > max) this.#fail(path, `holds at most ${max} items`);
    return items;
  }

  #string(
    value: unknown,
    path: string,
    max: number = PipelinePlanSchema.#textChars,
    { allowEmpty = false }: { allowEmpty?: boolean } = {},
  ): string {
    if (typeof value !== "string") this.#fail(path, "must be a string");
    const text = value as string;
    if (!allowEmpty && !text) this.#fail(path, "may not be empty");
    if (text.length > max) this.#fail(path, `is longer than ${max} characters`);
    return text;
  }

  #boolean(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") this.#fail(path, "must be a boolean");
    return value as boolean;
  }

  #int(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
    if (typeof value !== "number" || !Number.isInteger(value)) this.#fail(path, "must be an integer");
    const number = value as number;
    if (number < min || number > max) this.#fail(path, `must be between ${min} and ${max}`);
    return number;
  }

  #oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): T {
    if (typeof value !== "string" || !(options as readonly string[]).includes(value))
      this.#fail(path, `${JSON.stringify(value)} is not one of ${options.join(", ")}`);
    return value as T;
  }

  #fail(path: string, reason: string): never {
    throw new Error(`pipeline plan ${path}: ${reason}`);
  }
}

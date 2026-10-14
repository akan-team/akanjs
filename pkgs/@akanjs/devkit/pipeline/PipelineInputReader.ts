import {
  type PipelineDiagnostic,
  PipelineNames,
  PipelinePattern,
  type PipelinePlanRetry,
  type PipelineValueProblem,
  PipelineValueReader,
  pipelineActionNames,
  pipelineMilestones,
  pipelineOtaPlatforms,
  pipelinePlanLimits,
  pipelineTriggers,
} from "akanjs/common";
import type {
  PipelineActionStageRule,
  PipelineAppRule,
  PipelineAppStageRule,
  PipelineMatrixStageRule,
  PipelineParallelStageRule,
  PipelinePostRule,
  PipelineShellStageRule,
  PipelineStepRule,
  PipelineWhenRule,
  PipelineWorkspaceRule,
  PipelineWorkspaceStageRule,
} from "./PipelineRules";

type JsonObject = Record<string, unknown>;

/** Turns one file's `pipeline` value into rules, reporting what is wrong with it rather than throwing. */
export class PipelineInputReader {
  static readonly #futureKeys = ["cache", "artifacts", "input", "image", "services", "notify"];
  static readonly #stageKeys = ["id", "name", "description", "milestone", "when", "timeout", "allowFailure"];
  static readonly #shellKeys = [...PipelineInputReader.#stageKeys, "sh", "steps", "env", "secrets", "retry"];
  static readonly #postResults: readonly string[] = ["success", "failure", "canceled", "always"];
  static readonly #durationPattern = /^(\d+)(s|m|h)$/;
  static readonly #trailingHighSurrogate = /[\uD800-\uDBFF]$/;
  static readonly #stepNameChars = 80;
  static readonly #shownChars = 80;

  static clip(text: string, max: number) {
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    return `${PipelineInputReader.#trailingHighSurrogate.test(cut) ? cut.slice(0, -1) : cut}…`;
  }

  readonly diagnostics: PipelineDiagnostic[] = [];
  readonly #file: string;
  readonly #read = new PipelineValueReader<null>("config", (path, ...problems) => {
    for (const problem of problems) this.#problem(path, problem);
    return null;
  });

  constructor(file: string) {
    this.#file = file;
  }

  workspace(value: unknown): PipelineWorkspaceRule | null {
    const input = this.#read.object(value, "pipeline", ["schemaVersion", "env", "timeout", "before", "after", "post"]);
    if (!input) return null;
    this.#schemaVersion(input.schemaVersion, "pipeline.schemaVersion");
    const ids = new Set<string>();
    const stages = (key: "before" | "after") =>
      this.#list(input[key], `pipeline.${key}`).flatMap((stage, idx) => {
        const rule = this.#workspaceStage(stage, `pipeline.${key}[${idx}]`);
        if (rule) this.#claimId(ids, rule.id, rule.path);
        return rule ? [rule] : [];
      });
    return {
      env: this.#env(input.env, "pipeline.env"),
      timeoutSeconds: this.#duration(input.timeout, "pipeline.timeout"),
      before: stages("before"),
      after: stages("after"),
      post: this.#post(input.post, "pipeline.post"),
    };
  }

  app(value: unknown): PipelineAppRule | null {
    const input = this.#read.object(value, "pipeline", ["schemaVersion", "stages", "env", "after"]);
    if (!input) return null;
    this.#schemaVersion(input.schemaVersion, "pipeline.schemaVersion");
    if (input.stages === undefined) this.#report("pipeline.schema.invalid", "lists no `stages`", "pipeline");
    const ids = new Set<string>();
    const stages = this.#list(input.stages, "pipeline.stages").flatMap((stage, idx) => {
      const rule = this.#appStage(stage, `pipeline.stages[${idx}]`);
      if (rule) this.#claimId(ids, rule.id, rule.path);
      return rule ? [rule] : [];
    });
    return {
      env: this.#env(input.env, "pipeline.env"),
      after: this.#strings(input.after, "pipeline.after"),
      stages,
    };
  }

  #workspaceStage(value: unknown, path: string): PipelineWorkspaceStageRule | null {
    const raw = this.#read.object(value, path);
    if (!raw) return null;
    if (this.#declares(raw, "use")) {
      this.#report(
        "pipeline.schema.invalid",
        "built-in actions are declared per app, in apps/<app>/akan.config.ts",
        `${path}.use`,
      );
      return null;
    }
    if (this.#declares(raw, "parallel")) return this.#parallelStage(raw, path);
    if (this.#declares(raw, "matrix")) return this.#matrixStage(raw, path);
    return this.#shellStage(raw, path);
  }

  #appStage(value: unknown, path: string): PipelineAppStageRule | null {
    const raw = this.#read.object(value, path);
    if (!raw) return null;
    const workspaceKey = this.#declares(raw, "parallel") ? "parallel" : this.#declares(raw, "matrix") ? "matrix" : null;
    if (workspaceKey) {
      this.#report(
        "pipeline.schema.invalid",
        `an app's own stage takes no \`${workspaceKey}\`: it is already that app's, and parallel or per-app copies belong to the workspace root akan.config.ts`,
        path,
      );
      return null;
    }
    if (this.#declares(raw, "use")) return this.#actionStage(raw, path);
    return this.#shellStage(raw, path);
  }

  //? `key: undefined` is the key left out, but on a stage without `sh` or `steps` it still tells which kind was meant.
  #declares(raw: JsonObject, key: "use" | "parallel" | "matrix") {
    return raw[key] !== undefined || (key in raw && raw.sh === undefined && raw.steps === undefined);
  }

  #actionStage(raw: JsonObject, path: string): PipelineActionStageRule | null {
    if (
      !this.#read.keys(raw, path, [
        "use",
        ...PipelineInputReader.#stageKeys,
        "retry",
        ...(raw.use === "ota" ? ["targets", "platforms"] : []),
      ])
    )
      return null;
    const action = this.#read.oneOf(raw.use, `${path}.use`, pipelineActionNames);
    if (!action) return null;
    const name =
      raw.name === undefined ? null : this.#read.string(raw.name, `${path}.name`, pipelinePlanLimits.nameChars);
    const id = raw.id === undefined ? action : this.#id(raw.id, `${path}.id`);
    if (!id) return null;
    const attempts =
      raw.retry === undefined ? null : this.#read.int(raw.retry, `${path}.retry`, 1, pipelinePlanLimits.retryAttempts);
    return {
      kind: "action",
      action,
      id,
      name: name ?? action,
      named: name !== null,
      description: this.#description(raw.description, `${path}.description`),
      milestone: this.#milestone(raw.milestone, `${path}.milestone`),
      when: this.#when(raw.when, `${path}.when`),
      timeoutSeconds: this.#duration(raw.timeout, `${path}.timeout`),
      allowFailure: this.#boolean(raw.allowFailure, `${path}.allowFailure`),
      retry: attempts === null ? null : { attempts, delaySeconds: 0 },
      targets:
        raw.targets === undefined
          ? null
          : this.#nonEmptySet(this.#strings(raw.targets, `${path}.targets`), `${path}.targets`),
      platforms:
        raw.platforms === undefined
          ? null
          : this.#nonEmptySet(
              this.#list(raw.platforms, `${path}.platforms`).flatMap((platform, idx) => {
                const parsed = this.#read.oneOf(platform, `${path}.platforms[${idx}]`, pipelineOtaPlatforms);
                return parsed ? [parsed] : [];
              }),
              `${path}.platforms`,
            ),
      path,
    };
  }

  #nonEmptySet<T>(items: T[], path: string): T[] | null {
    if (!items.length) {
      this.#report("pipeline.schema.invalid", "lists none: leave it out to take the default", path);
      return null;
    }
    return [...new Set(items)];
  }

  #shellStage(raw: JsonObject, path: string): PipelineShellStageRule | null {
    if (!this.#read.keys(raw, path, PipelineInputReader.#shellKeys)) return null;
    const head = this.#stageHead(raw, path);
    if (!head) return null;
    const steps = this.#stageSteps(raw, path);
    return steps ? { kind: "sh", ...head, steps } : null;
  }

  #matrixStage(raw: JsonObject, path: string): PipelineMatrixStageRule | null {
    if (!this.#read.keys(raw, path, [...PipelineInputReader.#shellKeys, "matrix", "maxParallel"])) return null;
    if (raw.matrix !== "apps") {
      this.#report(
        "pipeline.schema.invalid",
        `${PipelineInputReader.#show(raw.matrix)} is not a matrix axis: only "apps"`,
        `${path}.matrix`,
      );
      return null;
    }
    const head = this.#stageHead(raw, path, { allowApp: true });
    if (!head) return null;
    const steps = this.#stageSteps(raw, path);
    if (!steps) return null;
    return { kind: "matrix", ...head, maxParallel: this.#maxParallel(raw.maxParallel, `${path}.maxParallel`), steps };
  }

  #parallelStage(raw: JsonObject, path: string): PipelineParallelStageRule | null {
    const keys = [...PipelineInputReader.#stageKeys, "parallel", "maxParallel", "failFast", "env", "secrets"];
    if (!this.#read.keys(raw, path, keys)) return null;
    const head = this.#stageHead(raw, path);
    if (!head) return null;
    const env = this.#env(raw.env, `${path}.env`);
    const secrets = this.#secrets(raw.secrets, `${path}.secrets`);
    const ids = new Set<string>();
    const branches = this.#list(raw.parallel, `${path}.parallel`).flatMap((branch, idx) => {
      const branchPath = `${path}.parallel[${idx}]`;
      const branchRaw = this.#read.object(branch, branchPath);
      if (!branchRaw) return [];
      if ((["use", "parallel", "matrix"] as const).some((key) => this.#declares(branchRaw, key))) {
        this.#report("pipeline.schema.invalid", "a parallel branch is a shell stage", branchPath);
        return [];
      }
      const rule = this.#shellStage(branchRaw, branchPath);
      if (!rule) return [];
      if (rule.when.changed && head.when.changed) {
        this.#report(
          "pipeline.schema.invalid",
          "`when.changed` on both a parallel stage and its branch cannot be combined; keep one",
          `${branchPath}.when.changed`,
        );
        return [];
      }
      if (head.id === "post" && PipelineInputReader.#postResults.includes(rule.id))
        this.#report(
          "pipeline.id.reserved",
          `"post.${rule.id}" is reserved for the steps of post.${rule.id}; give this branch or its parallel stage another \`id\``,
          `${branchPath}.${branchRaw.id === undefined ? "name" : "id"}`,
        );
      this.#claimId(ids, rule.id, rule.path);
      const steps = rule.steps.map((step) => ({
        ...step,
        env: { ...env, ...step.env },
        secrets: [...new Set([...secrets, ...step.secrets])],
      }));
      return [{ ...rule, steps }];
    });
    if (!branches.length && (raw.parallel === undefined || Array.isArray(raw.parallel)))
      this.#report("pipeline.schema.invalid", "a parallel stage holds at least one branch", `${path}.parallel`);
    return {
      kind: "parallel",
      ...head,
      maxParallel: this.#maxParallel(raw.maxParallel, `${path}.maxParallel`),
      failFast: this.#boolean(raw.failFast, `${path}.failFast`),
      branches,
    };
  }

  #stageHead(raw: JsonObject, path: string, { allowApp = false }: { allowApp?: boolean } = {}) {
    const name = this.#read.string(raw.name, `${path}.name`, pipelinePlanLimits.nameChars);
    if (name === null) return null;
    const id = raw.id === undefined ? this.#slugId(name, `${path}.name`) : this.#id(raw.id, `${path}.id`);
    if (!id) return null;
    return {
      id,
      name,
      description: this.#description(raw.description, `${path}.description`),
      milestone: this.#milestone(raw.milestone, `${path}.milestone`),
      when: this.#when(raw.when, `${path}.when`, { allowApp }),
      timeoutSeconds: this.#duration(raw.timeout, `${path}.timeout`),
      allowFailure: this.#boolean(raw.allowFailure, `${path}.allowFailure`),
      path,
    };
  }

  #stageSteps(raw: JsonObject, path: string): PipelineStepRule[] | null {
    if ((raw.sh === undefined) === (raw.steps === undefined)) {
      this.#report("pipeline.schema.invalid", "takes exactly one of `sh` and `steps`", path);
      return null;
    }
    const env = this.#env(raw.env, `${path}.env`);
    const secrets = this.#secrets(raw.secrets, `${path}.secrets`);
    const retry = this.#retry(raw.retry, `${path}.retry`);
    const steps = raw.sh === undefined ? this.#list(raw.steps, `${path}.steps`) : [raw.sh];
    const stepsPath = raw.sh === undefined ? `${path}.steps` : path;
    if (!steps.length) {
      this.#report("pipeline.schema.invalid", "a stage runs at least one step", stepsPath);
      return null;
    }
    const ids = new Set<string>();
    return steps.flatMap((step, idx) => {
      const stepPath = raw.sh === undefined ? `${stepsPath}[${idx}]` : `${path}.sh`;
      const rule = this.#step(step, stepPath, idx);
      if (!rule) return [];
      this.#claimId(ids, rule.localId, stepPath);
      return [
        {
          ...rule,
          retry: rule.retry ?? retry,
          env: { ...env, ...rule.env },
          secrets: [...new Set([...secrets, ...rule.secrets])],
        },
      ];
    });
  }

  #step(value: unknown, path: string, idx: number): PipelineStepRule | null {
    const raw = typeof value === "string" ? { sh: value } : this.#read.object(value, path);
    if (!raw) return null;
    const keys = ["sh", "id", "name", "cwd", "env", "secrets", "timeout", "retry", "allowFailure", "skipExitCodes"];
    if (!this.#read.keys(raw, path, keys)) return null;
    const run = this.#read.string(raw.sh, typeof value === "string" ? path : `${path}.sh`, Number.POSITIVE_INFINITY);
    if (run === null) return null;
    if (new TextEncoder().encode(run).length > pipelinePlanLimits.shBytes) {
      this.#report("pipeline.limit.exceeded", `a script is at most ${pipelinePlanLimits.shBytes} bytes`, path);
      return null;
    }
    const name =
      raw.name === undefined
        ? PipelineInputReader.#nameOf(run)
        : this.#read.string(raw.name, `${path}.name`, pipelinePlanLimits.nameChars);
    if (name === null) return null;
    const localId =
      raw.id !== undefined
        ? this.#id(raw.id, `${path}.id`)
        : raw.name !== undefined
          ? this.#slugId(name, `${path}.name`)
          : String(idx + 1);
    if (!localId) return null;
    return {
      localId,
      name,
      timeoutSeconds: this.#duration(raw.timeout, `${path}.timeout`),
      retry: this.#retry(raw.retry, `${path}.retry`),
      allowFailure: this.#boolean(raw.allowFailure, `${path}.allowFailure`),
      run,
      cwd: this.#cwd(raw.cwd, `${path}.cwd`),
      env: this.#env(raw.env, `${path}.env`),
      secrets: this.#secrets(raw.secrets, `${path}.secrets`),
      skipExitCodes: this.#exitCodes(raw.skipExitCodes, `${path}.skipExitCodes`),
    };
  }

  #post(value: unknown, path: string): PipelinePostRule {
    const empty: PipelinePostRule = { success: [], failure: [], canceled: [], always: [] };
    if (value === undefined) return empty;
    const raw = this.#read.object(value, path);
    if (!raw) return empty;
    for (const key of Object.keys(raw))
      if (!PipelineInputReader.#postResults.includes(key))
        this.#report(
          "pipeline.schema.unknownKey",
          key === "unstable"
            ? "`unstable` is not a result the framework knows: the executor decides which list an allowed failure runs"
            : `"${key}" is not a post result: success, failure, canceled or always`,
          `${path}.${key}`,
        );
    const steps = (key: keyof PipelinePostRule) => {
      const ids = new Set<string>();
      return this.#list(raw[key], `${path}.${key}`).flatMap((step, idx) => {
        const rule = this.#step(step, `${path}.${key}[${idx}]`, idx);
        if (rule) this.#claimId(ids, rule.localId, `${path}.${key}[${idx}]`);
        return rule ? [rule] : [];
      });
    };
    return {
      success: steps("success"),
      failure: steps("failure"),
      canceled: steps("canceled"),
      always: steps("always"),
    };
  }

  #when(value: unknown, path: string, { allowApp = false }: { allowApp?: boolean } = {}): PipelineWhenRule {
    const none: PipelineWhenRule = { branch: null, trigger: null, changed: null, app: null };
    if (value === undefined) return none;
    const raw = this.#read.object(value, path);
    if (!raw) return none;
    for (const key of Object.keys(raw)) {
      if (["branch", "trigger", "changed"].includes(key) || (allowApp && key === "app")) continue;
      this.#report(
        "pipeline.schema.unknownKey",
        key === "app"
          ? "`when.app` narrows a workspace matrix stage only; an app's own stages are already that app's"
          : `"${key}" is not a condition: branch, trigger, changed${allowApp ? " or app" : ""}`,
        `${path}.${key}`,
      );
    }
    const triggers =
      raw.trigger === undefined
        ? null
        : (typeof raw.trigger === "string" ? [raw.trigger] : this.#list(raw.trigger, `${path}.trigger`)).flatMap(
            (trigger, idx) => {
              const parsed = this.#read.oneOf(trigger, `${path}.trigger[${idx}]`, pipelineTriggers);
              return parsed ? [parsed] : [];
            },
          );
    if (Array.isArray(raw.trigger) && !raw.trigger.length)
      this.#report("pipeline.schema.invalid", "a trigger list may not be empty", `${path}.trigger`);
    return {
      branch: this.#patterns(raw.branch, `${path}.branch`),
      trigger: triggers,
      changed: this.#patterns(raw.changed, `${path}.changed`),
      app: allowApp ? this.#patterns(raw.app, `${path}.app`) : null,
    };
  }

  #patterns(value: unknown, path: string): string[] | null {
    if (value === undefined) return null;
    const patterns = typeof value === "string" ? [value] : this.#strings(value, path);
    const problem = PipelinePattern.validate(patterns);
    if (problem) {
      this.#report("pipeline.when.pattern", problem, path);
      return null;
    }
    return patterns;
  }

  #schemaVersion(value: unknown, path: string) {
    if (value !== undefined && value !== 1)
      this.#report(
        "pipeline.schema.unsupported",
        `${PipelineInputReader.#show(value)} is not a schemaVersion this CLI reads (1)`,
        path,
      );
  }

  #env(value: unknown, path: string): Record<string, string> {
    if (value === undefined) return {};
    const raw = this.#read.object(value, path);
    if (!raw) return {};
    const env: Record<string, string> = {};
    for (const [name, entry] of Object.entries(raw)) {
      const problem = PipelineNames.envNameError(name);
      if (problem) this.#report("pipeline.env.name", problem, `${path}.${name}`);
      else if (typeof entry !== "string")
        this.#report("pipeline.schema.invalid", "must be a string", `${path}.${name}`);
      else if (entry.length > pipelinePlanLimits.shBytes)
        this.#report(
          "pipeline.limit.exceeded",
          `an env value is at most ${pipelinePlanLimits.shBytes} characters`,
          `${path}.${name}`,
        );
      else env[name] = entry;
    }
    return env;
  }

  #secrets(value: unknown, path: string): string[] {
    const names = value === undefined ? [] : this.#strings(value, path);
    const valid = names.filter((name, idx) => {
      const problem = PipelineNames.secretNameError(name);
      if (problem) this.#report("pipeline.secret.name", problem, `${path}[${idx}]`);
      return !problem;
    });
    return [...new Set(valid)];
  }

  #cwd(value: unknown, path: string) {
    if (value === undefined) return ".";
    const cwd = this.#read.string(value, path, 1024);
    if (cwd === null) return ".";
    if (cwd.startsWith("/") || cwd.startsWith("~") || cwd.includes("\\") || cwd.split("/").includes("..")) {
      this.#report("pipeline.cwd.outside", `"${cwd}" is not a path inside the workspace`, path);
      return ".";
    }
    return cwd;
  }

  #exitCodes(value: unknown, path: string): number[] {
    if (value === undefined) return [];
    const codes = this.#list(value, path).flatMap((code, idx) => {
      const parsed = this.#read.int(code, `${path}[${idx}]`, 1, 255);
      return parsed === null ? [] : [parsed];
    });
    return [...new Set(codes)];
  }

  #retry(value: unknown, path: string): PipelinePlanRetry | null {
    if (value === undefined) return null;
    if (typeof value === "number") {
      const attempts = this.#read.int(value, path, 1, pipelinePlanLimits.retryAttempts);
      return attempts === null ? null : { attempts, delaySeconds: 0 };
    }
    const raw = this.#read.object(value, path);
    if (!raw || !this.#read.keys(raw, path, ["attempts", "delay"])) return null;
    const attempts = this.#read.int(raw.attempts, `${path}.attempts`, 1, pipelinePlanLimits.retryAttempts);
    const delaySeconds = this.#duration(raw.delay, `${path}.delay`, {
      min: 0,
      max: pipelinePlanLimits.retryDelaySeconds,
    });
    return attempts === null ? null : { attempts, delaySeconds: delaySeconds ?? 0 };
  }

  #duration(value: unknown, path: string, { min = 1, max = 86_400 }: { min?: number; max?: number } = {}) {
    if (value === undefined) return null;
    const match = typeof value === "string" ? PipelineInputReader.#durationPattern.exec(value) : null;
    const seconds =
      typeof value === "number" && Number.isInteger(value)
        ? value
        : match
          ? Number(match[1]) * { s: 1, m: 60, h: 3600 }[match[2] as "s" | "m" | "h"]
          : Number.NaN;
    if (!Number.isInteger(seconds) || seconds < min || seconds > max) {
      this.#report(
        "pipeline.duration.invalid",
        `${PipelineInputReader.#show(value)} is not a duration between ${min} and ${max} seconds: whole seconds, or "30s", "20m", "1h"`,
        path,
      );
      return null;
    }
    return seconds;
  }

  #maxParallel(value: unknown, path: string) {
    return value === undefined ? null : this.#read.int(value, path, 1, pipelinePlanLimits.stages);
  }

  #milestone(value: unknown, path: string) {
    return value === undefined ? null : this.#read.oneOf(value, path, pipelineMilestones);
  }

  #description(value: unknown, path: string) {
    return value === undefined ? null : this.#read.string(value, path, pipelinePlanLimits.descriptionChars);
  }

  #id(value: unknown, path: string) {
    const id = this.#read.string(value, path, 64);
    if (id === null) return null;
    const problem = PipelineNames.idError(id);
    if (problem) {
      this.#report("pipeline.id.invalid", problem, path);
      return null;
    }
    return id;
  }

  #slugId(name: string, path: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .slice(0, 64)
      .replace(/-+$/, "");
    if (!slug) {
      this.#report(
        "pipeline.id.invalid",
        `"${name}" has no letter or digit to make an id from: give it an \`id\``,
        path,
      );
      return null;
    }
    return slug;
  }

  #claimId(ids: Set<string>, id: string, path: string) {
    if (ids.has(id)) this.#report("pipeline.id.duplicate", `"${id}" is already the id of another one here`, path);
    ids.add(id);
  }

  static #nameOf(run: string) {
    const line = run
      .split("\n")
      .map((text) => text.trim())
      .find(Boolean);
    return PipelineInputReader.clip(line ?? run.trim(), PipelineInputReader.#stepNameChars);
  }

  static #show(value: unknown) {
    let text: string;
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = typeof value === "bigint" ? `${value}n` : Object.prototype.toString.call(value);
    }
    return PipelineInputReader.clip(text, PipelineInputReader.#shownChars);
  }

  #list(value: unknown, path: string): unknown[] {
    return value === undefined ? [] : (this.#read.list(value, path) ?? []);
  }

  #strings(value: unknown, path: string): string[] {
    return this.#list(value, path).flatMap((item, idx) => {
      const text = this.#read.string(item, `${path}[${idx}]`);
      return text === null ? [] : [text];
    });
  }

  #boolean(value: unknown, path: string) {
    return value === undefined ? false : (this.#read.boolean(value, path) ?? false);
  }

  #problem(path: string, problem: PipelineValueProblem) {
    if (problem.kind !== "unknownKey")
      this.#report("pipeline.schema.invalid", PipelineInputReader.#reason(problem), path);
    else if (PipelineInputReader.#futureKeys.includes(problem.key))
      this.#report(
        "pipeline.schema.unsupported",
        `\`${problem.key}\` is not supported in schemaVersion 1`,
        `${path}.${problem.key}`,
      );
    else
      this.#report(
        "pipeline.schema.unknownKey",
        `"${problem.key}" is not a key here: ${problem.keys.join(", ")}`,
        `${path}.${problem.key}`,
      );
  }

  static #reason(problem: Exclude<PipelineValueProblem, { kind: "unknownKey" }>): string {
    switch (problem.kind) {
      case "object":
        return "must be an object";
      case "missingKey":
        return `"${problem.key}" is missing`;
      case "list":
        return "must be a list";
      case "string":
      case "empty":
        return "must be a non-empty string";
      case "length":
        return `is longer than ${problem.max} characters`;
      case "boolean":
        return "must be true or false";
      case "int":
      case "range":
        return `must be a whole number between ${problem.min} and ${problem.max}`;
      case "oneOf":
        return `${PipelineInputReader.#show(problem.value)} is not one of ${problem.options.join(", ")}`;
    }
  }

  #report(code: string, message: string, path: string) {
    this.diagnostics.push({ severity: "error", code, message, file: this.#file, path });
  }
}

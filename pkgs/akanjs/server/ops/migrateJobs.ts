import { Logger } from "akanjs/common";
import { type MigrationAction, type MigrationCommandResult, migrationActions } from "../migration/migrationCommand";

export interface MigrateJobRequest {
  id: string;
  action: MigrationAction;
  argv: string[];
}

export interface MigrateJobState {
  id: string;
  action: MigrationAction;
  /** `done`: the command answered, and `result.ok` says how its run went; `failed`: it printed no result. */
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  result?: MigrationCommandResult;
  error?: string;
}

export interface MigrateProcessOutput {
  code: number;
  stdout: string;
  stderr: string;
}

/** `ops migrate` over the ops channel: one child at a time, its last line the job's result. */
export class MigrateJobs {
  static readonly maxRemembered = 20;
  static readonly idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  static readonly targetPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  static readonly paramNamePattern = /^[A-Za-z][A-Za-z0-9_]*$/;
  static readonly planHashPattern = /^[0-9a-f]{64}$/;
  static readonly #fields = new Set(["id", "action", "target", "params", "expect", "items"]);

  readonly #logger = new Logger("MigrateJobs");
  readonly #jobs = new Map<string, MigrateJobState>();
  readonly #run: (argv: string[]) => Promise<MigrateProcessOutput>;
  #running: Promise<void> | null = null;

  constructor(run: (argv: string[]) => Promise<MigrateProcessOutput>) {
    this.#run = run;
  }

  //* Every option rides as `--name=value`, so a value that starts with a dash is never read as another option.
  static requestOf(body: unknown, actor: string | undefined): MigrateJobRequest | string {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "the body must be a JSON object";
    const fields = body as Record<string, unknown>;
    if ("actor" in fields) return "actor comes from the token's sub, never the body";
    const unknown = Object.keys(fields).filter((key) => !MigrateJobs.#fields.has(key));
    if (unknown.length) return `unknown fields: ${unknown.join(", ")}`;
    const { id, action, target, params = {}, expect, items } = fields;
    if (typeof id !== "string" || !MigrateJobs.idPattern.test(id))
      return `id must match ${MigrateJobs.idPattern.source}`;
    if (typeof action !== "string" || !migrationActions.includes(action as MigrationAction))
      return `action must be one of ${migrationActions.join(", ")}`;
    if ((action === "apply" || action === "rollback") && !actor)
      return `${action} needs the token's sub, the person it runs for`;
    if (target !== undefined && (typeof target !== "string" || !MigrateJobs.targetPattern.test(target)))
      return `target must match ${MigrateJobs.targetPattern.source}`;
    if (!params || typeof params !== "object" || Array.isArray(params)) return "params must map names to strings";
    const entries = Object.entries(params);
    if (entries.some(([name, value]) => !MigrateJobs.paramNamePattern.test(name) || typeof value !== "string"))
      return "params must map names to strings";
    if (expect !== undefined && (typeof expect !== "string" || !MigrateJobs.planHashPattern.test(expect)))
      return "expect must be a planHash";
    if (items !== undefined && (typeof items !== "number" || !Number.isInteger(items) || items < 0))
      return "items must be a whole number";
    const argv = [
      action,
      ...(target ? [target] : []),
      ...entries.map(([name, value]) => `--param=${name}=${value as string}`),
      ...(expect ? [`--expect=${expect}`] : []),
      ...(items === undefined ? [] : [`--items=${items}`]),
      ...(actor && action !== "list" ? [`--actor=${actor}`] : []),
      "--json",
    ];
    return { id, action: action as MigrationAction, argv };
  }

  get(id: string) {
    return this.#jobs.get(id) ?? null;
  }

  start(request: MigrateJobRequest): MigrateJobState | "busy" | "exists" {
    if (this.#jobs.has(request.id)) return "exists";
    if (this.#running) return "busy";
    const job: MigrateJobState = {
      id: request.id,
      action: request.action,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    this.#remember(job);
    this.#running = this.#execute(job, request.argv).finally(() => {
      this.#running = null;
    });
    return { ...job };
  }

  async idle() {
    await this.#running;
  }

  async #execute(job: MigrateJobState, argv: string[]) {
    try {
      const { code, stdout, stderr } = await this.#run(argv);
      const result = MigrateJobs.#resultOf(stdout);
      if (!result)
        throw new Error(MigrateJobs.#lastLine(stderr) || `ops migrate exited with ${code} and printed no result`);
      job.exitCode = code;
      job.result = result;
      job.status = "done";
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      this.#logger.error(`Migrate job ${job.id} failed: ${job.error}`);
    } finally {
      job.finishedAt = new Date().toISOString();
    }
  }

  static #resultOf(stdout: string): MigrationCommandResult | null {
    try {
      const result = JSON.parse(MigrateJobs.#lastLine(stdout)) as unknown;
      if (!result || typeof result !== "object" || typeof (result as { ok?: unknown }).ok !== "boolean") return null;
      return result as MigrationCommandResult;
    } catch {
      return null;
    }
  }

  static #lastLine(text: string) {
    return text.trim().split("\n").at(-1)?.trim() ?? "";
  }

  #remember(job: MigrateJobState) {
    this.#jobs.set(job.id, job);
    while (this.#jobs.size > MigrateJobs.maxRemembered) {
      const oldest = this.#jobs.keys().next().value;
      if (oldest === undefined) break;
      this.#jobs.delete(oldest);
    }
  }
}

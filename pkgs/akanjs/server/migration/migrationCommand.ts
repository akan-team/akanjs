import { parseArgs } from "node:util";
import { MigrationError, type MigrationErrorCode } from "./migrationError";
import type { MigrationListItem, MigrationRunner } from "./migrationRunner";

export const migrationActions = ["list", "plan", "apply", "verify", "rollback"] as const;
export type MigrationAction = (typeof migrationActions)[number];

export interface MigrationArgs {
  action: MigrationAction;
  target: string;
  params: Record<string, string>;
  expect: string | null;
  actor: string | null;
  items: number | undefined;
  json: boolean;
}

/** The last line `ops migrate --json` prints: what akasys records, keyed by `ok` and `code`. */
export interface MigrationCommandResult {
  ok: boolean;
  action: MigrationAction | null;
  code?: MigrationErrorCode;
  error?: string;
  runId?: string | null;
  [key: string]: unknown;
}

export class MigrationCommand {
  static readonly usage = [
    "Usage:",
    "  ops migrate list [--json]",
    "  ops migrate plan <id> [--param <name>=<value>]... [--items <n>] [--actor <id>] [--json]",
    "  ops migrate apply <id> [--param <name>=<value>]... [--expect <planHash>] [--actor <id>] [--json]",
    "  ops migrate verify <id> [--param <name>=<value>]... [--actor <id>] [--json]",
    "  ops migrate rollback <applyRunId|id> [--actor <id>] [--json]",
  ].join("\n");
  static readonly #usageCodes = new Set<MigrationErrorCode>(["usage", "invalidParam", "notFound"]);

  static parse(argv: string[]): MigrationArgs {
    const { values, positionals } = MigrationCommand.#parseArgs(argv);
    const [action = "list", target = "", ...extra] = positionals;
    if (!migrationActions.includes(action as MigrationAction))
      throw new MigrationError("usage", `Unknown action "${action}"\n${MigrationCommand.usage}`);
    if (action === "list" ? target : !target)
      throw new MigrationError(
        "usage",
        `${action} ${target ? "takes no id" : "needs an id"}\n${MigrationCommand.usage}`,
      );
    if (extra.length) throw new MigrationError("usage", `Unexpected arguments: ${extra.join(" ")}`);
    const items = values.items === undefined ? undefined : Number(values.items);
    if (items !== undefined && !(Number.isInteger(items) && items >= 0))
      throw new MigrationError("usage", "--items takes a whole number");
    return {
      action: action as MigrationAction,
      target,
      params: MigrationCommand.#params(values.param ?? []),
      expect: values.expect ?? null,
      actor: values.actor ?? null,
      items,
      json: values.json,
    };
  }

  static async run(runner: MigrationRunner, args: MigrationArgs): Promise<MigrationCommandResult> {
    const { action, target, params, expect, actor, items } = args;
    try {
      if (action === "list") return { ok: true, action, migrations: await runner.list() };
      if (action === "plan") return { ok: true, action, ...(await runner.plan(target, params, { actor, items })) };
      if (action === "rollback") return { ok: true, action, ...(await runner.rollback(target, { actor })) };
      const result =
        action === "apply"
          ? await runner.apply(target, params, { expect, actor })
          : await runner.verify(target, params, { actor });
      const problemNum = result.problems.length;
      if (!problemNum) return { ok: true, action, ...result };
      const error = problemNum === 1 ? "1 problem remains" : `${problemNum} problems remain`;
      return { ok: false, action, code: "verifyFailed", error, ...result };
    } catch (error) {
      return MigrationCommand.failure(action, error);
    }
  }

  static failure(action: MigrationAction | null, error: unknown): MigrationCommandResult {
    return {
      ok: false,
      action,
      code: MigrationError.codeOf(error),
      error: MigrationError.messageOf(error),
      runId: error instanceof MigrationError ? error.runId : null,
    };
  }

  static exitCode(result: MigrationCommandResult) {
    if (result.ok) return 0;
    if (result.code === "verifyFailed") return 3;
    return result.code && MigrationCommand.#usageCodes.has(result.code) ? 2 : 1;
  }

  static render(result: MigrationCommandResult, json: boolean) {
    if (json) return JSON.stringify(result);
    if (result.ok && result.action === "list")
      return MigrationCommand.#renderList(result.migrations as MigrationListItem[]);
    return JSON.stringify(result, null, 2);
  }

  static #renderList(items: MigrationListItem[]) {
    if (!items.length) return "No migration in script/migration/";
    return items
      .map((item) => {
        const note = item.checksumMismatch ? "  (applied from another version of the script)" : "";
        const head = `${item.status.padEnd(8)} ${item.id}  ${item.title ?? `cannot load: ${item.error}`}${note}`;
        const params = item.params.map(
          (param) =>
            `--param ${param.name}=<${param.type}>${param.required ? "" : "default" in param ? ` (default ${JSON.stringify(param.default)})` : " (optional)"}`,
        );
        return [head, ...params.map((line) => `         ${line}`)].join("\n");
      })
      .join("\n");
  }

  static #parseArgs(argv: string[]) {
    try {
      return parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          param: { type: "string", multiple: true },
          expect: { type: "string" },
          actor: { type: "string" },
          items: { type: "string" },
          json: { type: "boolean", default: false },
        },
      });
    } catch (error) {
      throw new MigrationError("usage", `${MigrationError.messageOf(error)}\n${MigrationCommand.usage}`);
    }
  }

  static #params(pairs: string[]) {
    const params: Record<string, string> = {};
    for (const pair of pairs) {
      const at = pair.indexOf("=");
      const name = at > 0 ? pair.slice(0, at) : "";
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
        throw new MigrationError("usage", `--param takes <name>=<value>, not "${pair}"`);
      if (Object.hasOwn(params, name)) throw new MigrationError("usage", `--param ${name} is given twice`);
      params[name] = pair.slice(at + 1);
    }
    return params;
  }
}

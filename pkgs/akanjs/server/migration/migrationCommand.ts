import { parseArgs } from "node:util";
import { MigrationError, type MigrationErrorCode } from "./migrationError";
import type { MigrationListItem, MigrationRunner } from "./migrationRunner";

export const migrationActions = ["list", "plan", "apply", "verify", "rollback"] as const;
export type MigrationAction = (typeof migrationActions)[number];
const migrationOptions = ["param", "expect", "actor", "items"] as const;
type MigrationOption = (typeof migrationOptions)[number];

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
  static readonly #usageCodes = new Set<MigrationErrorCode>(["usage", "invalidParam", "notFound"]);
  static readonly #optionsOf: { [action in MigrationAction]: readonly MigrationOption[] } = {
    list: [],
    plan: ["param", "items", "actor"],
    apply: ["param", "expect", "actor"],
    verify: ["param", "actor"],
    rollback: ["actor"],
  };

  static usageOf(invokedAs = "ops migrate") {
    return [
      "Usage:",
      `  ${invokedAs} list [--json]`,
      `  ${invokedAs} plan <id> [--param <name>=<value>]... [--items <n>] [--actor <id>] [--json]`,
      `  ${invokedAs} apply <id> [--param <name>=<value>]... [--expect <planHash>] [--actor <id>] [--json]`,
      `  ${invokedAs} verify <id> [--param <name>=<value>]... [--actor <id>] [--json]`,
      `  ${invokedAs} rollback <applyRunId|id> [--actor <id>] [--json]`,
    ].join("\n");
  }

  static jsonOf(argv: string[]) {
    return argv.some((arg) => arg === "--json" || arg.startsWith("--json="));
  }

  static parse(argv: string[], invokedAs?: string): MigrationArgs {
    const usage = MigrationCommand.usageOf(invokedAs);
    const { values, positionals } = MigrationCommand.#parseArgs(argv, usage);
    const [name = "list", target = "", ...extra] = positionals;
    if (!migrationActions.includes(name as MigrationAction))
      throw new MigrationError("usage", `Unknown action "${name}"\n${usage}`);
    const action = name as MigrationAction;
    if (action === "list" ? target : !target)
      throw new MigrationError("usage", `${action} ${target ? "takes no id" : "needs an id"}\n${usage}`);
    if (extra.length) throw new MigrationError("usage", `Unexpected arguments: ${extra.join(" ")}`);
    const refused = migrationOptions.find(
      (option) => values[option] !== undefined && !MigrationCommand.#optionsOf[action].includes(option),
    );
    if (refused) throw new MigrationError("usage", `${action} takes no --${refused}\n${usage}`);
    if (values.items !== undefined && !/^\d+$/.test(values.items))
      throw new MigrationError("usage", "--items takes a whole number");
    return {
      action,
      target,
      params: MigrationCommand.#params(values.param ?? []),
      expect: values.expect ?? null,
      actor: values.actor ?? null,
      items: values.items === undefined ? undefined : Number(values.items),
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
      if (!result.problems.length) return { ok: true, action, ...result };
      return {
        ok: false,
        action,
        code: "verifyFailed",
        error: MigrationError.remaining(result.problems.length),
        ...result,
      };
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

  //* Waits for stdout to take the line: `ops migrate` exits right after, and an exit drops what a pipe still buffers.
  static async print(result: MigrationCommandResult, json: boolean) {
    const text = `${MigrationCommand.render(result, json)}\n`;
    await new Promise<void>((resolve) => process.stdout.write(text, () => resolve()));
    return MigrationCommand.exitCode(result);
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

  static #parseArgs(argv: string[], usage: string) {
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
      throw new MigrationError("usage", `${MigrationError.messageOf(error)}\n${usage}`);
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

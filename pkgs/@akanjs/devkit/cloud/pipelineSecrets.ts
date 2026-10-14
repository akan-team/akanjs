import { capitalize, Logger, PipelineNames } from "akanjs/common";
import { CloudApi, type PipelineSecretListing } from "./cloudApi";

//* The named secrets an Akan Cloud project hands its pipeline: written and removed by name, listed without values.
export class PipelineSecrets {
  static readonly #secretBytes = 64 * 1024;
  //? The branches Akan Cloud deploys (its BranchType): a secret scoped to any other is refused by the server.
  static readonly #secretBranches = ["debug", "develop", "main"];
  static readonly #secretsUnavailable = "The server is not configured for pipeline secrets yet";

  constructor(
    readonly cloudApi: CloudApi,
    readonly devProjectId: string,
  ) {}

  //* Never an argument: a value on the command line lands in shell history and in any `ps` listing.
  static async readValue(name: string, file: string | null) {
    const raw = file
      ? await Bun.file(file).text()
      : process.stdin.isTTY
        ? await (await import("@inquirer/prompts")).password({
            message: `Value of ${name} (hidden; it can never be read back)`,
            mask: "*",
          })
        : await PipelineSecrets.#readStdin(name);
    const value = raw.replace(/\r?\n$/, "");
    if (!value) throw new Error(`The value of ${name} is empty.`);
    const bytes = new TextEncoder().encode(value).length;
    if (bytes > PipelineSecrets.#secretBytes)
      throw new Error(`The value of ${name} is ${bytes} bytes, over ${PipelineSecrets.#secretBytes}.`);
    return value;
  }

  static async #readStdin(name: string) {
    process.stderr.write(`Reading the value of ${name} from stdin until it closes (or pass --file <path>).\n`);
    return await Bun.stdin.text();
  }

  async upload({ name, branch, value }: { name: string; branch: string | null; value: string }) {
    PipelineSecrets.assertName(name);
    PipelineSecrets.assertBranch(branch);
    const saved = await this.cloudApi
      .uploadSecret(this.devProjectId, { scope: branch ?? "*", name, value })
      .catch((error: unknown) => {
        throw CloudApi.refusal(error, "a secret is written by a project member signed in with `akan login`", {
          unavailable: PipelineSecrets.#secretsUnavailable,
        });
      });
    Logger.rawLog(
      `Saved ${saved.name} for ${saved.scope === "*" ? "every branch" : `branch ${saved.scope}`}. Builds that start from now on use it.`,
    );
  }

  async list(branch: string | null) {
    PipelineSecrets.assertBranch(branch);
    const listed = await this.cloudApi.listSecrets(this.devProjectId).catch((error: unknown) => {
      throw CloudApi.refusal(error, "the secrets are listed for a project member", {
        unavailable: PipelineSecrets.#secretsUnavailable,
      });
    });
    const secrets = listed.filter((secret) => !branch || secret.scope === "*" || secret.scope === branch);
    Logger.rawLog(PipelineSecrets.format(secrets));
  }

  async remove({ name, branch }: { name: string; branch: string | null }) {
    PipelineSecrets.assertName(name);
    PipelineSecrets.assertBranch(branch);
    const removed = await this.cloudApi
      .removeSecret(this.devProjectId, { scope: branch ?? "*", name })
      .catch((error: unknown) => {
        throw CloudApi.refusal(error, "a secret is removed by a project member signed in with `akan login`", {
          unavailable: PipelineSecrets.#secretsUnavailable,
        });
      });
    Logger.rawLog(
      removed
        ? `Removed ${name} for ${branch ? `branch ${branch}` : "every branch"}.`
        : `No ${name} for ${branch ? `branch ${branch}` : "every branch"} to remove.`,
    );
  }

  static format(secrets: PipelineSecretListing[]) {
    if (!secrets.length) return "No pipeline secrets.";
    const rows = [...secrets]
      .sort((a, b) => a.name.localeCompare(b.name) || a.scope.localeCompare(b.scope))
      .map((secret) =>
        [secret.name, secret.scope === "*" ? "every branch" : secret.scope, secret.updatedAt, secret.updatedBy].map(
          (cell) => String(cell ?? "-"),
        ),
      );
    const header = ["NAME", "SCOPE", "UPDATED", "BY"];
    const widths = header.map((title, column) =>
      Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0)),
    );
    return [header, ...rows]
      .map((row) =>
        row
          .map((cell, column) => cell.padEnd(widths[column] ?? 0))
          .join("  ")
          .trimEnd(),
      )
      .join("\n");
  }

  static assertName(name: string) {
    const problem = PipelineNames.secretNameError(name);
    if (problem) throw new Error(`${capitalize(problem)}.`);
  }

  static assertBranch(branch: string | null) {
    if (branch !== null && !PipelineSecrets.#secretBranches.includes(branch))
      throw new Error(`--branch ${branch} is not a deployed branch: ${PipelineSecrets.#secretBranches.join(", ")}.`);
  }
}

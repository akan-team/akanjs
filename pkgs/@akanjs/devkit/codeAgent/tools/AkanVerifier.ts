import { AkanCli, type AkanCliResult } from "./AkanCli";

export interface AkanVerifyReport {
  ok: boolean;
  text: string;
}

export class AkanVerifier {
  static readonly tailLines = 20;
  readonly #cli: AkanCli;

  constructor(cwd: string) {
    this.#cli = new AkanCli(cwd);
  }

  async verify(paths: string[] = []): Promise<AkanVerifyReport> {
    const args = ["verify", ...(paths.length ? ["--files", paths.join(",")] : [])];
    const result = await this.#cli.run(args, { timeoutMs: 600_000 });
    return { ok: result.ok, text: AkanVerifier.summarize(result) };
  }

  //* `akan verify` already prints the agent-sized report; only a crash before it prints needs trimming.
  static summarize(result: AkanCliResult) {
    if (result.output.startsWith("verify ")) return result.output;
    const lines = result.output.split("\n");
    const tail =
      lines.length <= AkanVerifier.tailLines ? result.output : `…\n${lines.slice(-AkanVerifier.tailLines).join("\n")}`;
    return `${result.command} exited ${result.exitCode} before reporting:\n${tail}`;
  }
}

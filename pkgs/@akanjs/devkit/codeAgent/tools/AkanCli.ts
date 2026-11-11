import { existsSync } from "node:fs";
import path from "node:path";
import { stripAnsi } from "../../util/stripAnsi";

export interface AkanCliResult {
  command: string;
  ok: boolean;
  exitCode: number;
  output: string;
}

// A subprocess: the akan runners print to inherited stdio and return nothing; it also isolates their crashes.
export class AkanCli {
  readonly #cwd: string;
  readonly #entry: string;

  constructor(cwd: string) {
    this.#cwd = cwd;
    this.#entry = AkanCli.#resolveEntry();
  }

  async run(args: string[], { timeoutMs = 300_000 }: { timeoutMs?: number } = {}): Promise<AkanCliResult> {
    const proc = Bun.spawn([process.execPath, this.#entry, ...args], {
      cwd: this.#cwd,
      stdout: "pipe",
      stderr: "pipe",
      //? A workspace .env's AKAN_PUBLIC_LOG_LEVEL=verbose reaches the child too, and buried its error under 90 lines.
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", AKAN_LOG_STDOUT_LEVEL: "warn" },
    });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    // tsgo colours regardless of NO_COLOR, and escape sequences are tokens the model pays for and cannot read.
    const output = stripAnsi(`${stdout}${stderr}`).trim();
    return { command: `akan ${args.join(" ")}`, ok: exitCode === 0, exitCode, output };
  }

  // Bundled, import.meta.dir is the CLI's output dir with index.js beside it; Bun.main fits only when the CLI is the
  // process. The path is written out because devkit does not depend on the CLI, and must not start.
  static #resolveEntry() {
    const candidates = [
      path.join(import.meta.dir, "index.js"),
      path.join(import.meta.dir, "..", "..", "..", "cli", "index.ts"),
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? Bun.main;
  }
}

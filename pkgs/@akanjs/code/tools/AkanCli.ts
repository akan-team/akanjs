import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { stripAnsi } from "@akanjs/devkit/util/stripAnsi";

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
    this.#entry = AkanCli.#resolveEntry(cwd);
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

  //? Bun.main is the akan that started this agent; a host embedding the engine is not one, so it gets the workspace's.
  static #resolveEntry(cwd: string) {
    const manifest = path.join(path.dirname(Bun.main), "package.json");
    if (
      existsSync(manifest) &&
      (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name === "@akanjs/cli"
    )
      return Bun.main;
    try {
      return Bun.resolveSync("@akanjs/cli", cwd);
    } catch {
      return Bun.main;
    }
  }
}

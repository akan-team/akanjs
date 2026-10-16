import path from "node:path";

/** Runs a probe script in a process of its own and reads the one JSON line it prints last. */
export class ProbeRunner {
  readonly #root: string;
  constructor(root: string) {
    this.#root = root;
  }

  //? `--no-env-file`: the root `.env` sets a debug log level, which would log every call the probe makes.
  async run(script: string, args: string[] = []): Promise<Record<string, number>> {
    const proc = Bun.spawn(["bun", "--no-env-file", path.join(import.meta.dir, script), ...args], {
      cwd: this.#root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const line = stdout
      .split("\n")
      .reverse()
      .find((text) => text.startsWith("{"));
    if (exitCode !== 0 || !line) throw new Error(`${script} ${args.join(" ")} failed (exit ${exitCode}):\n${stderr}`);
    return JSON.parse(line) as Record<string, number>;
  }

  static median(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  }
}

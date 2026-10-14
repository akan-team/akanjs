import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

export interface ProjectTypecheckOptions {
  clean?: boolean;
  incremental?: boolean;
  /** The project's own `*.test.ts` / `*.spec.ts` as well. */
  tests?: boolean;
}

//* tsc checks what the entries import, and nothing imports a test, so a test is checked only when it is included by
//* name. Each mode keeps a tsconfig and an incremental cache of its own, so one never invalidates the other.
export class ProjectTypecheck {
  static readonly #testIncludes = ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"];
  static readonly #excludes = [".akan/**", "node_modules/**", "local/**"];

  constructor(
    readonly projectDir: string,
    readonly workspaceRoot: string,
    readonly env: Record<string, string | undefined>,
  ) {}

  get typecheckDir() {
    return path.join(this.projectDir, ".akan", "typecheck");
  }

  /** `entries`: relative to the typecheck folder (`../../server.ts`). */
  async run(entries: string[], { clean = false, incremental = true, tests = false }: ProjectTypecheckOptions = {}) {
    const name = tests ? "tsconfig.tests" : "tsconfig";
    await mkdir(this.typecheckDir, { recursive: true });
    const tsconfig = {
      extends: "../../tsconfig.json",
      compilerOptions: { noEmit: true, incremental, tsBuildInfoFile: `./${name}.tsbuildinfo` },
      include: [...entries, ...(tests ? ProjectTypecheck.#testIncludes.map((glob) => `../../${glob}`) : [])],
      ...(tests ? { exclude: ProjectTypecheck.#excludes.map((glob) => `../../${glob}`) } : {}),
      references: [],
    };
    const tsconfigPath = path.join(this.typecheckDir, `${name}.json`);
    await Bun.write(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
    if (clean) await rm(path.join(this.typecheckDir, `${name}.tsbuildinfo`), { force: true });
    await this.#check(tsconfigPath);
    return tsconfigPath;
  }

  async #check(tsconfigPath: string) {
    const proc = Bun.spawn([process.execPath, await ProjectTypecheck.workerEntry(this.workspaceRoot)], {
      cwd: this.workspaceRoot,
      env: { ...this.env, AKAN_COMMAND_TYPE: "typecheck", AKAN_TYPECHECK_TSCONFIG: tsconfigPath },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) throw new Error((stderr || stdout).trim() || `Typecheck failed with exit code ${exitCode}`);
  }

  //? The workspace's own devkit first, then an installed one, then the entry a bundle puts beside its chunks.
  static async workerEntry(workspaceRoot: string) {
    const candidates = [
      path.join(workspaceRoot, "pkgs/@akanjs/devkit/typecheck/typecheck.proc.ts"),
      path.join(workspaceRoot, "node_modules/@akanjs/devkit/typecheck/typecheck.proc.ts"),
      path.join(import.meta.dir, "typecheck.proc.js"),
      path.join(import.meta.dir, "typecheck.proc.ts"),
      path.join(import.meta.dir, "..", "typecheck.proc.js"),
    ];
    for (const candidate of candidates) if (await Bun.file(candidate).exists()) return candidate;
    throw new Error(`[devkit] typecheck worker entry not found; looked in: ${candidates.join(", ")}`);
  }
}

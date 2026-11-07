import { ExitCodeError } from "@akanjs/devkit/commandDecorators";

export type VerifyTargetType = "app" | "lib" | "pkg";

export interface VerifyTarget {
  type: VerifyTargetType;
  name: string;
  dir: string;
  /** Changed files under `dir`, relative to the workspace root; empty means the whole target. */
  files: string[];
}

export interface VerifyChange {
  code: string;
  file: string;
}

export interface VerifyNames {
  apps: string[];
  libs: string[];
  pkgs: string[];
}

export class VerifyScope {
  constructor(readonly targets: VerifyTarget[]) {}

  get touchesTsx() {
    return this.targets.some((target) => target.files.some((file) => file.endsWith(".tsx")));
  }

  get changedFiles() {
    return new Set(this.targets.flatMap((target) => target.files));
  }

  //* `-z` keeps a path with spaces or non-ASCII bytes unquoted; porcelain paths are relative to the git top level.
  static async changesIn(workspaceRoot: string): Promise<VerifyChange[] | null> {
    const prefix = await VerifyScope.#git(workspaceRoot, ["rev-parse", "--show-prefix"]);
    if (prefix === null) return null;
    const status = await VerifyScope.#git(workspaceRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    if (status === null) return null;
    return VerifyScope.parseStatus(status, prefix.trim());
  }

  static parseStatus(status: string, prefix = ""): VerifyChange[] {
    const tokens = status.split("\0");
    const changes: VerifyChange[] = [];
    for (let idx = 0; idx < tokens.length; idx++) {
      const token = tokens[idx] ?? "";
      if (token.length < 4) continue;
      const code = token.slice(0, 2);
      const file = token.slice(3);
      if (code.includes("R") || code.includes("C")) idx++;
      if (!file.startsWith(prefix)) continue;
      changes.push({ code, file: file.slice(prefix.length) });
    }
    return changes;
  }

  static resolve(changes: VerifyChange[], names: VerifyNames, requested: string[] = []): VerifyScope {
    const known = VerifyScope.#knownTargets(names);
    const changedFilesOf = (dir: string) =>
      changes.filter((change) => change.file.startsWith(`${dir}/`)).map((change) => change.file);
    if (requested.length) {
      const targets = requested.map((name) => {
        const target = known.find((candidate) => candidate.name === name);
        if (!target) throw new ExitCodeError(`${name} is not an app, library or package of this workspace`, 2);
        return { ...target, files: changedFilesOf(target.dir) };
      });
      return new VerifyScope(targets);
    }
    const targets = known
      .map((target) => ({ ...target, files: changedFilesOf(target.dir) }))
      .filter((target) => target.files.length > 0);
    return new VerifyScope(targets);
  }

  static #knownTargets({ apps, libs, pkgs }: VerifyNames): VerifyTarget[] {
    return [
      ...apps.map((name) => ({ type: "app" as const, name, dir: `apps/${name}`, files: [] })),
      ...libs.map((name) => ({ type: "lib" as const, name, dir: `libs/${name}`, files: [] })),
      ...pkgs.map((name) => ({ type: "pkg" as const, name, dir: `pkgs/${name}`, files: [] })),
    ];
  }

  static async #git(cwd: string, args: string[]) {
    const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "ignore" });
    const [text, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return exitCode === 0 ? text : null;
  }
}

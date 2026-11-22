export interface AkanEditScopeResult {
  paths: string[];
  apps: string[];
  libs: string[];
  pkgs: string[];
  /** A created, deleted or renamed file under `apps/**` or `libs/**` — the only kind a barrel has to catch up with. */
  needsSync: boolean;
  touchesTsx: boolean;
}

const empty: AkanEditScopeResult = { paths: [], apps: [], libs: [], pkgs: [], needsSync: false, touchesTsx: false };

// Read from git, not tool events: an edit made through `bash` (a heredoc, sed, a codemod) produces no write tool call.
export class AkanEditScope {
  static async since(cwd: string, baseline: ReadonlySet<string>): Promise<AkanEditScopeResult> {
    const current = await AkanEditScope.baseline(cwd);
    const changed = [...current].filter((line) => !baseline.has(line));
    if (!changed.length) return empty;
    const entries = changed.map((line) => ({ code: line.slice(0, 2), file: line.slice(3).split(" -> ").at(-1) ?? "" }));
    const paths = entries.map((entry) => entry.file).filter(Boolean);
    return {
      paths,
      apps: AkanEditScope.#targets(paths, "apps"),
      libs: AkanEditScope.#targets(paths, "libs"),
      pkgs: AkanEditScope.#targets(paths, "pkgs"),
      needsSync: entries.some((entry) => /[ARD?]/.test(entry.code) && /^(apps|libs)\//.test(entry.file)),
      touchesTsx: paths.some((file) => file.endsWith(".tsx")),
    };
  }

  /** The porcelain lines before a turn, so the turn is judged on what it changed rather than on a dirty tree. */
  static async baseline(cwd: string) {
    const proc = Bun.spawn(["git", "status", "--porcelain=v1", "--untracked-files=all"], {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
    });
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    return new Set(text.split("\n").filter((line) => line.trim().length > 3));
  }

  static #targets(paths: string[], root: "apps" | "libs" | "pkgs") {
    const names = paths
      .filter((file) => file.startsWith(`${root}/`))
      .map((file) => {
        const [, first = "", second = ""] = file.split("/");
        return first.startsWith("@") && second ? `${first}/${second}` : first;
      })
      .filter(Boolean);
    return [...new Set(names)];
  }
}

import type { AkanChangedFile } from "@akanjs/language";

export type ForkPoint = { sha: string; error?: undefined } | { sha?: undefined; error: string };

const systemPaths = ["apps", "libs"];
const changeOfStatus: { [status: string]: AkanChangedFile["change"] | undefined } = { A: "added", D: "removed" };

//? Commands run in the workspace root, which may sit below the repository root; `./<path>` and `--relative` keep every
//? path git reads or prints relative to the workspace.
export class GitRevision {
  static readonly #defaultBranches = ["upstream/HEAD", "upstream/main", "origin/HEAD", "origin/main", "main", "master"];
  //? Studio and MCP read git beside the user's own commands; without this, `git diff` may take index.lock to refresh it.
  static readonly #env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  async forkPointOf(since: string | null): Promise<ForkPoint> {
    if ((await this.#git(["rev-parse", "--is-inside-work-tree"]))?.trim() !== "true")
      return { error: "The Change Map compares with git history, and this workspace is not in a git repository." };
    if (since !== null) {
      //? A leading `-` would reach git as an option.
      const sha = /^[^-\s][^\s]*$/.test(since)
        ? (await this.#git(["rev-parse", "--verify", "--quiet", `${since}^{commit}`]))?.trim()
        : undefined;
      if (!sha) return { error: `${since} is not a commit in this repository.` };
      return await this.#mergeBase(since, sha);
    }
    for (const branch of GitRevision.#defaultBranches)
      if ((await this.#git(["rev-parse", "--verify", "--quiet", `${branch}^{commit}`])) !== null)
        return await this.#mergeBase(branch, branch);
    const head = (await this.#git(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]))?.trim();
    return head ? { sha: head } : { error: "The repository has no commit to compare with yet." };
  }

  async #mergeBase(name: string, revision: string): Promise<ForkPoint> {
    const sha = (await this.#git(["merge-base", "HEAD", revision]))?.trim();
    if (sha) return { sha };
    return {
      error: `HEAD shares no commit with ${name} here. In a shallow clone, \`git fetch --unshallow\` brings the history in.`,
    };
  }

  async filesAt(sha: string, isWanted: (file: string) => boolean): Promise<Map<string, string>> {
    const listed = await this.#git(["ls-tree", "-r", "-z", "--name-only", sha, "--", ...systemPaths]);
    if (listed === null) throw new Error(`git ls-tree failed for ${sha}`);
    const files = listed.split("\0").filter((file) => file && isWanted(file));
    const texts = new Map<string, string>();
    if (!files.length) return texts;
    const proc = Bun.spawn(["git", "cat-file", "--batch"], {
      cwd: this.#root,
      env: GitRevision.#env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = new Response(proc.stdout).arrayBuffer();
    proc.stdin.write(files.map((file) => `${sha}:./${file}\n`).join(""));
    await proc.stdin.end();
    const bytes = new Uint8Array(await output);
    if ((await proc.exited) !== 0) throw new Error(`git cat-file failed for ${sha}`);
    const decoder = new TextDecoder();
    let offset = 0;
    for (const file of files) {
      const lineEnd = bytes.indexOf(10, offset);
      if (lineEnd < 0) throw new Error(`git cat-file ended before ${file} at ${sha}`);
      const header = decoder.decode(bytes.subarray(offset, lineEnd));
      offset = lineEnd + 1;
      if (header.endsWith(" missing")) continue;
      const [, type, size] = header.split(" ");
      const length = Number(size);
      if (type === "blob") texts.set(file, decoder.decode(bytes.subarray(offset, offset + length)));
      offset += length + 1;
    }
    return texts;
  }

  async changedFilesSince(sha: string): Promise<AkanChangedFile[]> {
    const [tracked, untracked] = await Promise.all([
      this.#git(["diff", "--name-status", "--no-renames", "--relative", "-z", sha, "--", ...systemPaths]),
      this.#git(["ls-files", "-z", "--others", "--exclude-standard", "--", ...systemPaths]),
    ]);
    if (tracked === null || untracked === null) throw new Error(`git could not list the changes since ${sha}`);
    const changes = new Map<string, AkanChangedFile["change"]>();
    const fields = tracked.split("\0");
    for (let idx = 0; idx + 1 < fields.length; idx += 2)
      changes.set(fields[idx + 1], changeOfStatus[fields[idx]] ?? "changed");
    for (const file of untracked.split("\0")) if (file) changes.set(file, "added");
    return [...changes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([file, change]) => ({ file, change }));
  }

  //? Tracked and untracked files, `.gitignore` applied, so the working side of a Change Map sees what the base side
  //? can: a glob would read ignored files the base never has and mark them added.
  async workingFiles(): Promise<string[]> {
    const listed = await this.#git([
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...systemPaths,
    ]);
    if (listed === null) throw new Error("git ls-files failed");
    return [...new Set(listed.split("\0").filter(Boolean))];
  }

  async #git(args: string[]) {
    try {
      const proc = Bun.spawn(["git", ...args], {
        cwd: this.#root,
        env: GitRevision.#env,
        stdout: "pipe",
        stderr: "ignore",
      });
      const [text, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      return exitCode === 0 ? text : null;
    } catch {
      return null;
    }
  }
}

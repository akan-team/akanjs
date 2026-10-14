import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { toError } from "akanjs/common";
import { Executor, WorkspaceExecutor } from "./executors";
import { FileSys } from "./fileSys";
import { LibSource } from "./libSource";
import { type SlicePlan, SlicePlanner } from "./slicePlanner";
import type { SubspaceDeclaration } from "./subspaceConfig";
import type { PackageJson } from "./types";

export class SubspaceClone {
  static readonly anchorFile = "akan.subspace.json";
  /**
   * The workspace's own never reach a subspace — its root config names every other customer's repo, its Jenkinsfile
   * deploys the workspace — and a subspace's own survive every push.
   */
  static readonly subspaceOwnedRootEntries = ["akan.config.ts", "Jenkinsfile"];
  static readonly syncSubjectPrefix = "chore(subspace): sync from ";
  /** Workspace members, which are replaced wholesale rather than overlaid. */
  static readonly memberDirs = ["apps", "libs"];
  /** Subspace-owned in both directions: env values belong to the repo that deploys, not to the workspace. */
  static readonly subspaceOwnedDirs = ["env"];
  static readonly secretsMarkers = ["# akan:secrets (managed by akan.config.ts — do not edit)", "# akan:secrets:end"];
  static readonly holdDir = ".akan-subspace-hold";

  static isSubspaceOwned(file: string) {
    const segments = file.split("/");
    if (!SubspaceClone.memberDirs.includes(segments[0] ?? "")) return false;
    return SubspaceClone.subspaceOwnedDirs.includes(segments[2] ?? "");
  }

  static async open(workspace: WorkspaceExecutor, declaration: SubspaceDeclaration, branch: string) {
    const clone = new SubspaceClone(workspace, declaration);
    await clone.#ensure(branch);
    return clone;
  }

  readonly #workspace: WorkspaceExecutor;
  readonly #declaration: SubspaceDeclaration;
  readonly #clonePath: string;
  readonly #clone: Executor;

  constructor(workspace: WorkspaceExecutor, declaration: SubspaceDeclaration) {
    this.#workspace = workspace;
    this.#declaration = declaration;
    this.#clonePath = path.join(workspace.workspaceRoot, ".akan/subspace", declaration.name);
    this.#clone = new Executor(`subspace-${declaration.name}`, this.#clonePath);
  }

  async #cloneGit(args: string[]) {
    return await this.#workspace.spawn("git", ["-C", this.#clonePath, ...args]);
  }

  async #ensure(branch: string) {
    if (!(await FileSys.dirExists(path.join(this.#clonePath, ".git")))) {
      await rm(this.#clonePath, { recursive: true, force: true });
      await mkdir(path.dirname(this.#clonePath), { recursive: true });
      await this.#workspace.spawn("git", ["clone", "--quiet", this.#declaration.repo, this.#clonePath]);
    }
    await this.#clone.spawn("git", ["fetch", "--quiet", "origin", branch]);
    await this.#clone.spawn("git", ["checkout", "--quiet", "-f", "-B", branch, `origin/${branch}`]);
    await this.#clone.spawn("git", ["clean", "-qfd"]);
  }

  async applySlice(
    { libs, paths, plans }: { libs: string[]; paths: string[]; plans: SlicePlan[] },
    { branch, sha, remove }: { branch: string; sha: string; remove: string[] },
  ) {
    const held = await this.#holdSubspaceOwned();
    const heldRootEntries = await this.#holdRootEntries();
    for (const member of SubspaceClone.memberDirs)
      await rm(path.join(this.#clonePath, member), { recursive: true, force: true });

    //* Overlaid, never reconciled: a subspace owns its deployment, so a root entry the workspace lacks is left alone.
    await this.#extract(["."], ["apps/*", "libs/*", "pkgs/*"]);
    await this.#extract(paths);
    await this.#restoreRootEntries(heldRootEntries);
    await this.#restoreSubspaceOwned(held);

    for (const entry of remove)
      if (!SubspaceClone.subspaceOwnedRootEntries.includes(entry))
        await rm(path.join(this.#clonePath, entry), { recursive: true, force: true });

    await this.#rewriteGitignore();
    const pruned = await this.#rewriteManifest(plans);
    await this.#rewriteWorkspaceSection(libs);
    await this.#writeLocalEnv();
    for (const lib of libs) await this.#stampLib(lib, branch, sha);
    return { libs, pruned };
  }

  async changedFiles() {
    const dirty = (await this.#clone.spawn("git", ["status", "--porcelain"])).trim();
    return dirty ? dirty.split("\n").length : 0;
  }

  // Refuses rather than throws, so one failing subspace does not abort the rest; the env is explicit so the child
  // sees the clone's values, not the workspace's.
  async verify() {
    const env = { ...process.env, ...this.#localEnv() };
    try {
      await this.#clone.spawn("bun", ["install"], { env });
      for (const app of this.#declaration.apps) await this.#clone.spawn("bunx", ["akan", "sync", app], { env });
      return null;
    } catch (error) {
      return toError(error).message;
    }
  }

  async lock() {
    const lockPath = path.join(this.#clonePath, "bun.lock");
    return (await FileSys.fileExists(lockPath)) ? await FileSys.readText(lockPath) : null;
  }

  async commit(branch: string, sha: string) {
    await this.#writeAnchorFile(branch, sha);
    await this.#clone.spawn("git", ["add", "-A"]);
    const message = `${SubspaceClone.syncSubjectPrefix}${this.#workspace.repoName}@${sha}`;
    await this.#clone.spawn("git", ["commit", "--quiet", "-m", message]);
    //* Never force: a diverged subspace holds customer commits, and `pull` is how those come back.
    await this.#clone.spawn("git", ["push", "--quiet", "origin", branch]);
    return (await this.#clone.spawn("git", ["rev-parse", "--short", "HEAD"])).trim();
  }

  async #writeAnchorFile(branch: string, sha: string) {
    await FileSys.writeJson(path.join(this.#clonePath, SubspaceClone.anchorFile), {
      workspace: this.#workspace.repoName,
      hubSha: sha,
      branch,
      apps: this.#declaration.apps,
      syncedAt: new Date().toISOString(),
    });
  }

  /** Moves the subspace's env trees aside, so replacing the members cannot take them with it. */
  async #holdSubspaceOwned() {
    const held: { from: string; to: string }[] = [];
    const holdRoot = path.join(this.#clonePath, SubspaceClone.holdDir);
    await rm(holdRoot, { recursive: true, force: true });
    for (const member of SubspaceClone.memberDirs) {
      const memberRoot = path.join(this.#clonePath, member);
      if (!(await FileSys.dirExists(memberRoot))) continue;
      for (const name of await readdir(memberRoot)) {
        for (const owned of SubspaceClone.subspaceOwnedDirs) {
          const from = path.join(memberRoot, name, owned);
          if (!(await FileSys.dirExists(from))) continue;
          const to = path.join(holdRoot, member, name, owned);
          await mkdir(path.dirname(to), { recursive: true });
          await rename(from, to);
          held.push({ from, to });
        }
      }
    }
    return held;
  }

  // The workspace owns the tracked env switch files; the per-environment values it gitignores belong to the subspace.
  async #restoreSubspaceOwned(held: { from: string; to: string }[]) {
    for (const { from, to } of held) await SubspaceClone.#copyMissing(to, from);
    await rm(path.join(this.#clonePath, SubspaceClone.holdDir), { recursive: true, force: true });
  }

  //* A root entry last written by a sync commit is a copy an earlier push left there, the parent's Jenkinsfile among them:
  //* it goes. Any other is the subspace's own and is held through the extraction.
  async #holdRootEntries() {
    const holdRoot = path.join(this.#clonePath, SubspaceClone.holdDir, "root");
    const held: string[] = [];
    for (const entry of SubspaceClone.subspaceOwnedRootEntries) {
      const from = path.join(this.#clonePath, entry);
      if (!(await FileSys.entryExists(from))) continue;
      if (await this.#isPushedCopy(entry)) continue;
      await mkdir(holdRoot, { recursive: true });
      await rename(from, path.join(holdRoot, entry));
      held.push(entry);
    }
    return held;
  }

  async #restoreRootEntries(held: string[]) {
    const holdRoot = path.join(this.#clonePath, SubspaceClone.holdDir, "root");
    for (const entry of SubspaceClone.subspaceOwnedRootEntries) {
      const target = path.join(this.#clonePath, entry);
      await rm(target, { recursive: true, force: true });
      if (held.includes(entry)) await rename(path.join(holdRoot, entry), target);
    }
  }

  async #isPushedCopy(entry: string) {
    const subject = await this.#cloneGit(["log", "-1", "--format=%s", "--", entry]).catch(() => "");
    return subject.trim().startsWith(SubspaceClone.syncSubjectPrefix);
  }

  static async #copyMissing(from: string, to: string) {
    await mkdir(to, { recursive: true });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      const source = path.join(from, entry.name);
      const target = path.join(to, entry.name);
      if (entry.isDirectory()) await SubspaceClone.#copyMissing(source, target);
      else if (!(await FileSys.entryExists(target))) await rename(source, target);
    }
  }

  // `git archive` emits only tracked files, so generated barrels, lib symlinks, env values and secrets never enter.
  async #extract(paths: string[], excludes: string[] = []) {
    // Relative, because GNU tar reads a drive-letter archive name (`C:\…`) as `host:path` on a remote host.
    const archivePath = path.relative(this.#workspace.workspaceRoot, `${this.#clonePath}.tar`);
    await this.#workspace.spawn("git", ["archive", "-o", archivePath, "HEAD", "--", ...paths]);
    try {
      await this.#workspace.spawn("tar", [
        "-x",
        "-f",
        archivePath,
        "-C",
        this.#clonePath,
        ...excludes.map((entry) => `--exclude=${entry}`),
      ]);
    } finally {
      await rm(path.join(this.#workspace.workspaceRoot, archivePath), { force: true });
    }
  }

  // An allowlist, not a filter, so no secret can reach a customer's clone; `AKAN_PUBLIC_*` ships in every bundle anyway.
  #localEnv() {
    const { serveDomain } = WorkspaceExecutor.getBaseDevEnv();
    return {
      AKAN_WORKSPACE_ID: "local",
      AKAN_PUBLIC_REPO_NAME: this.#declaration.name,
      AKAN_PUBLIC_SERVE_DOMAIN: serveDomain,
      AKAN_PUBLIC_ENV: "local",
      AKAN_PUBLIC_OPERATION_MODE: "local",
      AKAN_PUBLIC_LOG_LEVEL: "warn",
    };
  }

  // The CLI needs a `.env` to recognise a workspace root and none arrives with the slice. Excluded through
  // `.git/info/exclude`, not the copied `.gitignore`, so it can never be committed to the customer's repo.
  async #writeLocalEnv() {
    const excludePath = path.join(this.#clonePath, ".git/info/exclude");
    const exclude = (await FileSys.fileExists(excludePath)) ? await FileSys.readText(excludePath) : "";
    if (!exclude.split("\n").includes("/.env")) {
      await mkdir(path.dirname(excludePath), { recursive: true });
      await FileSys.writeText(excludePath, exclude.trim() ? `${exclude.replace(/\n*$/, "\n")}/.env\n` : "/.env\n");
    }
    const envPath = path.join(this.#clonePath, ".env");
    if (await FileSys.fileExists(envPath)) return;
    const lines = Object.entries(this.#localEnv()).map(([key, value]) => `${key}=${value}`);
    await FileSys.writeText(envPath, `${lines.join("\n")}\n`);
  }

  // The root manifest is the union of every app's dependencies, so it is rebuilt from this subspace's slices.
  async #rewriteManifest(plans: SlicePlan[]) {
    const manifestPath = path.join(this.#clonePath, "package.json");
    if (!(await FileSys.fileExists(manifestPath))) return [];
    const rootPackageJson = (await FileSys.readJson(manifestPath)) as PackageJson;
    const { packageJson, pruned, warnings } = await SlicePlanner.pruneDependencies(
      this.#workspace,
      rootPackageJson,
      plans.flatMap((plan) => plan.requiredDependencies),
    );
    for (const warning of warnings) this.#workspace.logger.warn(warning);
    await FileSys.writeJson(manifestPath, {
      ...packageJson,
      name: this.#declaration.name,
      description: `${this.#declaration.name} workspace`,
    });
    return pruned;
  }

  // `akan:secrets` names every workspace app, so it is filtered; `bun.lock` is un-ignored because a subspace commits it.
  async #rewriteGitignore() {
    const gitignorePath = path.join(this.#clonePath, ".gitignore");
    if (!(await FileSys.fileExists(gitignorePath))) return;
    const [begin = "", end = ""] = SubspaceClone.secretsMarkers;
    // `git archive` checks text out as CRLF under Windows Git's default `core.autocrlf=true`.
    const lines = (await FileSys.readText(gitignorePath)).split(/\r?\n/);
    const beginIdx = lines.indexOf(begin);
    const endIdx = lines.indexOf(end);
    const filtered =
      beginIdx >= 0 && endIdx > beginIdx
        ? [
            ...lines.slice(0, beginIdx + 1),
            ...lines
              .slice(beginIdx + 1, endIdx)
              .filter((line) => this.#declaration.apps.some((app) => line.startsWith(`apps/${app}/`))),
            ...lines.slice(endIdx),
          ]
        : lines;
    await FileSys.writeText(gitignorePath, filtered.filter((line) => line.trim() !== "**/bun.lock").join("\n"));
  }

  /** The generated `## Workspace` block names every app and library in the workspace. */
  async #rewriteWorkspaceSection(libs: string[]) {
    const replacements = [
      [/^- Repo: .*$/m, `- Repo: ${this.#declaration.name}`],
      [/^- Apps: .*$/m, `- Apps: ${this.#declaration.apps.join(", ")}`],
      [/^- Libraries: .*$/m, `- Libraries: ${libs.length ? libs.join(", ") : "(none)"}`],
    ] as const;
    for (const file of ["AGENTS.md", "CLAUDE.md"]) {
      const filePath = path.join(this.#clonePath, file);
      if (!(await FileSys.fileExists(filePath))) continue;
      const content = await FileSys.readText(filePath);
      const rewritten = replacements.reduce((text, [pattern, value]) => text.replace(pattern, value), content);
      if (rewritten !== content) await FileSys.writeText(filePath, rewritten);
    }
  }

  // Not through `LibSource`, which addresses a library by its position in the workspace. The hash skips `env/` and
  // the stamp itself.
  async #stampLib(lib: string, branch: string, sha: string) {
    const manifestPath = path.join(this.#clonePath, "libs", lib, "package.json");
    if (!(await FileSys.fileExists(manifestPath))) return;
    const origin = `${this.#workspace.repoName}#${branch}`;
    const [hash, previous] = await Promise.all([this.#hashLib(lib), this.#committedStamp(lib)]);
    const manifest = (await FileSys.readJson(manifestPath)) as Record<string, unknown>;
    const akan = (manifest[LibSource.manifestKey] ?? {}) as Record<string, unknown>;
    //* The extraction overwrote the manifest, so the previous stamp comes from the clone's HEAD. It is kept whole while
    //* the library's content is unchanged — matching the workspace sha too would rewrite every manifest, and push,
    //* after any unrelated workspace commit.
    const unchanged = previous?.origin === origin && previous.hash === hash;
    const source = unchanged ? previous : { origin, sha, hash, syncedAt: new Date().toISOString() };
    manifest[LibSource.manifestKey] = { ...akan, source };
    await FileSys.writeJson(manifestPath, manifest);
  }

  async #committedStamp(lib: string) {
    try {
      const committed = await this.#clone.spawn("git", ["show", `HEAD:libs/${lib}/package.json`]);
      const manifest = JSON.parse(committed) as Record<string, unknown>;
      const akan = (manifest[LibSource.manifestKey] ?? {}) as Record<string, unknown>;
      return akan.source as { origin: string; sha: string; hash: string; syncedAt: string } | undefined;
    } catch {
      //? First push: the library is not in the subspace's history yet.
      return undefined;
    }
  }

  async #hashLib(lib: string) {
    const listed = await this.#clone.spawn("git", [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      `libs/${lib}`,
    ]);
    const candidates = listed
      .split("\0")
      .filter((file) => !!file && !SubspaceClone.isSubspaceOwned(file))
      .sort();
    //* The index still lists files the workspace deleted since the last push (only the push's `git add -A`
    //* reconciles it), and opening one throws.
    const present = await Promise.all(
      candidates.map(async (file) => await FileSys.entryExists(path.join(this.#clonePath, file))),
    );
    const files = candidates.filter((_, index) => present[index]);
    return await LibSource.hashFiles(files, `libs/${lib}/package.json`, (file) =>
      FileSys.readText(path.join(this.#clonePath, file)),
    );
  }
}

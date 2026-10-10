import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { AppExecutor, Executor, WorkspaceExecutor } from "./executors";
import { FileSys } from "./fileSys";
import { LibSource } from "./libSource";
import { type SlicePlan, SlicePlanner } from "./slicePlanner";
import type { SubspaceConfig, SubspaceDeclaration } from "./subspaceConfig";
import type { PackageJson } from "./types";

export interface SubspaceIncomingCommit {
  sha: string;
  author: string;
  subject: string;
}

export interface SubspaceAnchor {
  /** Subspace commit that last carried a push, located by the one file only a push writes. */
  commit: string | null;
  /** Commits the subspace gained since then — customer work that has never been in the workspace. */
  incoming: SubspaceIncomingCommit[];
}

export interface SubspaceStatus {
  name: string;
  branch: string;
  /** False when the subspace has no such branch: a push refuses it rather than creating it. */
  hasBranch: boolean;
  anchor: SubspaceAnchor;
  /** Slice paths where workspace and subspace disagree — what a push would change. */
  behindPaths: string[];
  /** Libraries the subspace edited on its own: the drift this mechanism exists to stop. */
  driftedLibs: string[];
}

export interface SubspaceDiffSection {
  files: string[];
  patch: string;
}

export interface SubspaceDiffResult {
  name: string;
  branch: string;
  /** What `akan subspace push` would change in the subspace, split so library changes are impossible to miss. */
  app: SubspaceDiffSection;
  libs: SubspaceDiffSection;
}

export interface SubspacePushResult {
  name: string;
  outcome: "pushed" | "skipped" | "refused";
  reason?: string;
  commit?: string;
  changedFiles: number;
  /** Workspace-root dependencies left out of this subspace's manifest, because its apps do not use them. */
  prunedDependencies?: string[];
}

export interface SubspacePlan {
  name: string;
  repo: string;
  branch: string;
  /** Why a push from this branch would be refused, or null when it may push. */
  branchRefusal: string | null;
  apps: string[];
  /** Each library the slice carries, with the apps whose closure pulls it in. */
  libs: { name: string; apps: string[] }[];
  /** Tracked files under the slice's apps/ and libs/ directories. */
  files: number;
  /** Workspace-root entries a push copies into the subspace. */
  rootEntries: string[];
  excludedRootEntries: string[];
  /** Workspace-root entries never pushed: the subspace keeps its own copy, if it has one. */
  subspaceOwnedRootEntries: string[];
  prunedDependencies: string[];
  /** Why the workspace's bun.lock would make a push refuse, or null. */
  lockProblem: string | null;
  warnings: string[];
}

export interface SubspaceEnvUploadResult {
  name: string;
  /** The cloud workspace whose env archive was replaced: the subspace's own, never this workspace's. */
  workspaceId: string;
  host: string;
  outcome: "uploaded" | "cancelled";
  apps: string[];
  libs: string[];
  files: string[];
}

export interface SubspacePullResult {
  name: string;
  applied: string[];
  /** Library hunks, left on disk as a patch instead of applied unless `adoptLibs` was passed. */
  libPatch: { path: string; files: string[] } | null;
  ignored: string[];
  incoming: SubspaceIncomingCommit[];
}

// Push is a squashed snapshot, so no workspace history (or other customer's commit message) reaches a subspace;
// pull diffs against the last push received, so it is exactly the customer's own work.
export class Subspace {
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
  static readonly #loopbackRegistry = /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(?::\d+)?/;

  #workspace: WorkspaceExecutor;
  #config: SubspaceConfig;
  #declaration: SubspaceDeclaration;

  constructor(workspace: WorkspaceExecutor, config: SubspaceConfig, declaration: SubspaceDeclaration) {
    this.#workspace = workspace;
    this.#config = config;
    this.#declaration = declaration;
  }

  get name() {
    return this.#declaration.name;
  }
  get apps() {
    return this.#declaration.apps;
  }
  get workspaceId() {
    return this.#declaration.workspaceId;
  }
  get #remote() {
    return `subspace-${this.#declaration.name}`;
  }
  get #clonePath() {
    return path.join(this.#workspace.workspaceRoot, ".akan/subspace", this.#declaration.name);
  }

  async #git(args: string[]) {
    return await this.#workspace.spawn("git", args);
  }

  async #cloneGit(args: string[]) {
    return await this.#workspace.spawn("git", ["-C", this.#clonePath, ...args]);
  }

  async branch() {
    return (await this.#git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  }

  async headSha() {
    return (await this.#git(["rev-parse", "--short", "HEAD"])).trim();
  }

  async fetch(branch: string) {
    const remotes = (await this.#git(["remote"])).split("\n").map((line) => line.trim());
    if (remotes.includes(this.#remote)) await this.#git(["remote", "set-url", this.#remote, this.#declaration.repo]);
    else await this.#git(["remote", "add", this.#remote, this.#declaration.repo]);
    try {
      await this.#git(["fetch", "--quiet", this.#remote, branch]);
      return true;
    } catch {
      //? A subspace that has never had this branch is not an error here — `push` refuses it by name.
      return false;
    }
  }

  //* Located by the one file only a push writes: unlike a tag or a recorded sha, it cannot drift out of the history.
  async anchor(branch: string): Promise<SubspaceAnchor> {
    const ref = `${this.#remote}/${branch}`;
    const commit = (await this.#git(["log", "-1", "--format=%H", ref, "--", Subspace.anchorFile])).trim();
    if (!commit) return { commit: null, incoming: [] };
    const log = await this.#git(["log", "--format=%H%x09%an%x09%s", `${commit}..${ref}`]);
    const incoming = log
      .split("\n")
      .filter((line) => !!line.trim())
      .map((line) => {
        const [sha = "", author = "", ...subject] = line.split("\t");
        return { sha: sha.slice(0, 12), author, subject: subject.join("\t") };
      });
    return { commit, incoming };
  }

  /** App and lib directories this subspace carries. Libraries come from each app's closure, never declared. */
  async slice() {
    const plans = await Promise.all(
      this.#declaration.apps.map(
        async (appName) => await new SlicePlanner(AppExecutor.from(this.#workspace, appName)).plan(),
      ),
    );
    const libs = [...new Set(plans.flatMap((plan) => plan.libs))].sort();
    const paths = [...this.#declaration.apps.map((app) => `apps/${app}`), ...libs.map((lib) => `libs/${lib}`)];
    return { plans, libs, paths };
  }

  /** What a push from `branch` would ship, worked out from this checkout alone: no fetch, no remote, no clone. */
  async plan(branch: string): Promise<SubspacePlan> {
    const { plans, libs } = await this.slice();
    const rootFiles = plans[0]?.rootFiles ?? [];
    const present = new Set(rootFiles.map((file) => file.split("/")[0] ?? file));
    const owned = Subspace.subspaceOwnedRootEntries;
    const excluded = this.#config.exclude.filter((entry) => !owned.includes(entry));
    const excludedTops = new Set(excluded.map((entry) => entry.replace(/\/+$/, "")));
    const libFiles = new Map(plans.flatMap((plan) => Object.entries(plan.libFiles)));
    const { pruned, warnings } = await SlicePlanner.pruneDependencies(
      this.#workspace,
      await this.#workspace.getPackageJson(),
      plans.flatMap((plan) => plan.requiredDependencies),
    );
    let branchRefusal: string | null = null;
    try {
      this.#config.assertPushable(branch);
    } catch (error) {
      branchRefusal = error instanceof Error ? error.message : String(error);
    }
    return {
      name: this.name,
      repo: this.#declaration.repo,
      branch,
      branchRefusal,
      apps: [...this.#declaration.apps],
      libs: libs.map((lib) => ({
        name: lib,
        apps: plans.filter((plan) => plan.libs.includes(lib)).map((plan) => plan.app),
      })),
      files:
        plans.reduce((sum, plan) => sum + plan.appFiles.length, 0) +
        [...libFiles.values()].reduce((sum, files) => sum + files.length, 0),
      rootEntries: [...present]
        .filter((entry) => !excludedTops.has(entry) && !owned.includes(entry))
        .sort((a, b) => a.localeCompare(b)),
      excludedRootEntries: excluded,
      subspaceOwnedRootEntries: owned.filter((entry) => present.has(entry)),
      prunedDependencies: pruned,
      lockProblem: rootFiles.includes("bun.lock")
        ? await this.#loopbackRegistryLock(this.#workspace.workspaceRoot)
        : null,
      warnings: [...new Set([...plans.flatMap((plan) => plan.warnings), ...warnings])],
    };
  }

  #isSubspaceOwned(file: string) {
    const segments = file.split("/");
    if (!Subspace.memberDirs.includes(segments[0] ?? "")) return false;
    return Subspace.subspaceOwnedDirs.includes(segments[2] ?? "");
  }

  // A library manifest always differs by the `akan.source` stamp a push writes, so it is compared without that key.
  #isStamped(file: string) {
    return /^libs\/[^/]+\/package\.json$/.test(file);
  }

  async #differsBeyondStamp(ref: string, file: string) {
    const [theirs, ours] = await Promise.all([
      this.#git(["show", `${ref}:${file}`]).catch(() => ""),
      this.#git(["show", `HEAD:${file}`]).catch(() => ""),
    ]);
    if (!theirs || !ours) return true;
    const normalize = (content: string) => {
      try {
        return LibSource.unstamped(content);
      } catch {
        return content;
      }
    };
    return normalize(theirs) !== normalize(ours);
  }

  async #changedSliceFiles(ref: string, diffArgs: string[]) {
    const files = (await this.#git(["diff", "--name-only", ...diffArgs]))
      .split("\n")
      .filter((file) => !!file.trim() && !this.#isSubspaceOwned(file));
    const kept = await Promise.all(
      files.map(async (file) => (this.#isStamped(file) ? await this.#differsBeyondStamp(ref, file) : true)),
    );
    return files.filter((_, index) => kept[index]);
  }

  async status(branch: string): Promise<SubspaceStatus> {
    const hasBranch = await this.fetch(branch);
    const [{ paths, libs }, anchor] = await Promise.all([
      this.slice(),
      hasBranch ? this.anchor(branch) : Promise.resolve<SubspaceAnchor>({ commit: null, incoming: [] }),
    ]);
    if (!hasBranch) return { name: this.name, branch, hasBranch, anchor, behindPaths: [], driftedLibs: [] };
    const ref = `${this.#remote}/${branch}`;
    const behindPaths = await this.#changedSliceFiles(ref, ["HEAD", ref, "--", ...paths]);
    const driftedLibs = libs.filter((lib) => behindPaths.some((file) => file.startsWith(`libs/${lib}/`)));
    return { name: this.name, branch, hasBranch, anchor, behindPaths, driftedLibs };
  }

  async #ensureClone(branch: string) {
    if (!(await FileSys.dirExists(path.join(this.#clonePath, ".git")))) {
      await rm(this.#clonePath, { recursive: true, force: true });
      await mkdir(path.dirname(this.#clonePath), { recursive: true });
      await this.#workspace.spawn("git", ["clone", "--quiet", this.#declaration.repo, this.#clonePath]);
    }
    const clone = new Executor(`subspace-${this.name}`, this.#clonePath);
    await clone.spawn("git", ["fetch", "--quiet", "origin", branch]);
    await clone.spawn("git", ["checkout", "--quiet", "-f", "-B", branch, `origin/${branch}`]);
    await clone.spawn("git", ["clean", "-qfd"]);
    return clone;
  }

  /** Moves the subspace's env trees aside, so replacing the members cannot take them with it. */
  async #holdSubspaceOwned() {
    const held: { from: string; to: string }[] = [];
    const holdRoot = path.join(this.#clonePath, Subspace.holdDir);
    await rm(holdRoot, { recursive: true, force: true });
    for (const member of Subspace.memberDirs) {
      const memberRoot = path.join(this.#clonePath, member);
      if (!(await FileSys.dirExists(memberRoot))) continue;
      for (const name of await readdir(memberRoot)) {
        for (const owned of Subspace.subspaceOwnedDirs) {
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
    for (const { from, to } of held) await Subspace.#copyMissing(to, from);
    await rm(path.join(this.#clonePath, Subspace.holdDir), { recursive: true, force: true });
  }

  //* A root entry last written by a sync commit is a copy an earlier push left there, the parent's Jenkinsfile among them:
  //* it goes. Any other is the subspace's own and is held through the extraction.
  async #holdRootEntries() {
    const holdRoot = path.join(this.#clonePath, Subspace.holdDir, "root");
    const held: string[] = [];
    for (const entry of Subspace.subspaceOwnedRootEntries) {
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
    const holdRoot = path.join(this.#clonePath, Subspace.holdDir, "root");
    for (const entry of Subspace.subspaceOwnedRootEntries) {
      const target = path.join(this.#clonePath, entry);
      await rm(target, { recursive: true, force: true });
      if (held.includes(entry)) await rename(path.join(holdRoot, entry), target);
    }
  }

  async #isPushedCopy(entry: string) {
    const subject = await this.#cloneGit(["log", "-1", "--format=%s", "--", entry]).catch(() => "");
    return subject.trim().startsWith(Subspace.syncSubjectPrefix);
  }

  static async #copyMissing(from: string, to: string) {
    await mkdir(to, { recursive: true });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      const source = path.join(from, entry.name);
      const target = path.join(to, entry.name);
      if (entry.isDirectory()) await Subspace.#copyMissing(source, target);
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
      AKAN_PUBLIC_REPO_NAME: this.name,
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
      name: this.name,
      description: `${this.name} workspace`,
    });
    return pruned;
  }

  async #applySlice(clone: Executor, branch: string) {
    const { libs, paths, plans } = await this.slice();
    const held = await this.#holdSubspaceOwned();
    const heldRootEntries = await this.#holdRootEntries();
    for (const member of Subspace.memberDirs)
      await rm(path.join(this.#clonePath, member), { recursive: true, force: true });

    //* Overlaid, never reconciled: a subspace owns its deployment, so a root entry the workspace lacks is left alone.
    await this.#extract(["."], ["apps/*", "libs/*", "pkgs/*"]);
    await this.#extract(paths);
    await this.#restoreRootEntries(heldRootEntries);
    await this.#restoreSubspaceOwned(held);

    for (const entry of this.#config.exclude)
      if (!Subspace.subspaceOwnedRootEntries.includes(entry))
        await rm(path.join(this.#clonePath, entry), { recursive: true, force: true });

    await this.#rewriteGitignore();
    const pruned = await this.#rewriteManifest(plans);
    await this.#rewriteWorkspaceSection(libs);
    await this.#writeLocalEnv();
    for (const lib of libs) await this.#stampLib(clone, lib, branch);
    return { libs, pruned };
  }

  // `akan:secrets` names every workspace app, so it is filtered; `bun.lock` is un-ignored because a subspace commits it.
  async #rewriteGitignore() {
    const gitignorePath = path.join(this.#clonePath, ".gitignore");
    if (!(await FileSys.fileExists(gitignorePath))) return;
    const [begin = "", end = ""] = Subspace.secretsMarkers;
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
      [/^- Repo: .*$/m, `- Repo: ${this.name}`],
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
  async #stampLib(clone: Executor, lib: string, branch: string) {
    const manifestPath = path.join(this.#clonePath, "libs", lib, "package.json");
    if (!(await FileSys.fileExists(manifestPath))) return;
    const origin = `${this.#workspace.repoName}#${branch}`;
    const sha = await this.headSha();
    const [hash, previous] = await Promise.all([this.#hashLib(clone, lib), this.#committedStamp(clone, lib)]);
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

  async #committedStamp(clone: Executor, lib: string) {
    try {
      const committed = await clone.spawn("git", ["show", `HEAD:libs/${lib}/package.json`]);
      const manifest = JSON.parse(committed) as Record<string, unknown>;
      const akan = (manifest[LibSource.manifestKey] ?? {}) as Record<string, unknown>;
      return akan.source as { origin: string; sha: string; hash: string; syncedAt: string } | undefined;
    } catch {
      //? First push: the library is not in the subspace's history yet.
      return undefined;
    }
  }

  async #hashLib(clone: Executor, lib: string) {
    const listed = await clone.spawn("git", [
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
      .filter((file) => !!file && !this.#isSubspaceOwned(file))
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

  /** Direction is subspace → workspace, so the patch reads as what a push would apply rather than its inverse. */
  async diff(branch: string, filter?: string | null): Promise<SubspaceDiffResult> {
    if (!(await this.fetch(branch))) throw new Error(`Subspace "${this.name}" has no branch "${branch}"`);
    const { libs, paths } = await this.slice();
    const libPaths = libs.map((lib) => `libs/${lib}`);
    const appPaths = paths.filter((entry) => !libPaths.includes(entry));
    const [app, libSection] = await Promise.all([
      this.#diffSection(branch, appPaths, filter),
      this.#diffSection(branch, libPaths, filter),
    ]);
    return { name: this.name, branch, app, libs: libSection };
  }

  async #diffSection(branch: string, paths: string[], filter?: string | null): Promise<SubspaceDiffSection> {
    const scoped = filter ? paths.filter((entry) => entry.startsWith(filter) || filter.startsWith(entry)) : paths;
    if (!scoped.length) return { files: [], patch: "" };
    const from = `${this.#remote}/${branch}`;
    const files = await this.#changedSliceFiles(from, [from, "HEAD", "--", ...(filter ? [filter] : scoped)]);
    if (!files.length) return { files: [], patch: "" };
    //? argv, not a shell: a route path such as `page/(docs)/…` would need quoting through one.
    return { files, patch: await this.#git(["diff", from, "HEAD", "--", ...files]) };
  }

  // A lock written against a local registry (verdaccio) resolves on this machine alone: every install of it fails.
  async #loopbackRegistryLock(root = this.#clonePath) {
    const lockPath = path.join(root, "bun.lock");
    if (!(await FileSys.fileExists(lockPath))) return null;
    const registry = (await FileSys.readText(lockPath)).match(Subspace.#loopbackRegistry)?.[0];
    return registry
      ? `bun.lock resolves packages from ${registry}, a registry only this machine reaches; reinstall from a public registry and commit that lock first`
      : null;
  }

  // Refuses rather than throws, so one failing subspace does not abort the rest; the env is explicit so the child
  // sees the clone's values, not the workspace's.
  async #verify(clone: Executor) {
    const env = { ...process.env, ...this.#localEnv() };
    try {
      await clone.spawn("bun", ["install"], { env });
      for (const app of this.#declaration.apps) await clone.spawn("bunx", ["akan", "sync", app], { env });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  async push(branch: string, { verify = true }: { verify?: boolean } = {}): Promise<SubspacePushResult> {
    this.#config.assertPushable(branch);
    if (await this.#workspace.hasChanges())
      return { name: this.name, outcome: "refused", reason: "workspace working tree is dirty", changedFiles: 0 };
    if (!(await this.fetch(branch)))
      return { name: this.name, outcome: "refused", reason: `subspace has no branch "${branch}"`, changedFiles: 0 };

    const clone = await this.#ensureClone(branch);
    const { pruned } = await this.#applySlice(clone, branch);

    const dirty = (await clone.spawn("git", ["status", "--porcelain"])).trim();
    if (!dirty)
      return {
        name: this.name,
        outcome: "skipped",
        reason: "already up to date",
        changedFiles: 0,
        prunedDependencies: pruned,
      };

    const changedFiles = dirty.split("\n").length;
    if (verify) {
      const failure = await this.#verify(clone);
      if (failure) return { name: this.name, outcome: "refused", reason: failure, changedFiles };
    }
    const lockProblem = await this.#loopbackRegistryLock();
    if (lockProblem) return { name: this.name, outcome: "refused", reason: lockProblem, changedFiles };
    await this.#writeAnchorFile(branch);
    await clone.spawn("git", ["add", "-A"]);
    const message = `${Subspace.syncSubjectPrefix}${this.#workspace.repoName}@${await this.headSha()}`;
    await clone.spawn("git", ["commit", "--quiet", "-m", message]);
    //* Never force: a diverged subspace holds customer commits, and `pull` is how those come back.
    await clone.spawn("git", ["push", "--quiet", "origin", branch]);
    return {
      name: this.name,
      outcome: "pushed",
      commit: (await clone.spawn("git", ["rev-parse", "--short", "HEAD"])).trim(),
      changedFiles,
      prunedDependencies: pruned,
    };
  }

  async #writeAnchorFile(branch: string) {
    await FileSys.writeJson(path.join(this.#clonePath, Subspace.anchorFile), {
      workspace: this.#workspace.repoName,
      hubSha: await this.headSha(),
      branch,
      apps: this.#declaration.apps,
      syncedAt: new Date().toISOString(),
    });
  }

  async pull(branch: string, { adoptLibs = false }: { adoptLibs?: boolean } = {}): Promise<SubspacePullResult> {
    if (!(await this.fetch(branch))) throw new Error(`Subspace "${this.name}" has no branch "${branch}"`);
    const anchor = await this.anchor(branch);
    if (!anchor.commit)
      throw new Error(`Subspace "${this.name}" carries no ${Subspace.anchorFile} — it has never received a push`);
    if (!anchor.incoming.length) return { name: this.name, applied: [], libPatch: null, ignored: [], incoming: [] };

    const range = `${anchor.commit}..${this.#remote}/${branch}`;
    const changed = (await this.#git(["diff", "--name-only", range])).split("\n").filter((file) => !!file.trim());
    const appPrefixes = this.#declaration.apps.map((app) => `apps/${app}/`);
    const appFiles = changed.filter(
      (file) => appPrefixes.some((prefix) => file.startsWith(prefix)) && !this.#isSubspaceOwned(file),
    );
    const libFiles = changed.filter((file) => file.startsWith("libs/") && !this.#isSubspaceOwned(file));
    const ignored = changed.filter((file) => !appFiles.includes(file) && !libFiles.includes(file));

    const applied = adoptLibs ? [...appFiles, ...libFiles] : appFiles;
    if (applied.length) await this.#applyPatch(range, applied, "incoming");
    const saved = !adoptLibs && libFiles.length ? await this.#savePatch(range, libFiles, "libs") : null;
    const libPatch = saved ? { path: saved.path, files: saved.files } : null;
    return { name: this.name, applied, libPatch, ignored, incoming: anchor.incoming };
  }

  /** Left uncommitted in the workspace's working tree: a conflict is a normal 3-way conflict for a person. */
  async #applyPatch(range: string, files: string[], label: string) {
    const { absolute } = await this.#savePatch(range, files, label);
    await this.#git(["apply", "--3way", absolute]);
  }

  // Not applied by default: every subspace is pushed from the workspace, so one customer's lib edit would ship to all.
  async #savePatch(range: string, files: string[], label: string) {
    const patchPath = path.join(this.#workspace.workspaceRoot, ".akan/subspace", `${this.name}-${label}.patch`);
    await mkdir(path.dirname(patchPath), { recursive: true });
    await FileSys.writeText(patchPath, await this.#git(["diff", range, "--", ...files]));
    return { path: path.relative(this.#workspace.workspaceRoot, patchPath), absolute: patchPath, files };
  }
}

export function formatSubspaceStatuses(statuses: SubspaceStatus[]) {
  const sections = [
    "Akan Subspace Status",
    `branch: ${statuses[0]?.branch ?? "(none)"}`,
    "",
    ...statuses.flatMap((status) => {
      if (!status.hasBranch) return [`  ${status.name}: no such branch in the subspace — push is refused`];
      const behind = status.behindPaths.length ? `${status.behindPaths.length} file(s) behind` : "up to date";
      const incoming = status.anchor.incoming.length
        ? `${status.anchor.incoming.length} customer commit(s) to pull`
        : "no customer commits";
      const drift = status.driftedLibs.length ? `  DRIFTED LIBS: ${status.driftedLibs.join(", ")}` : null;
      return [
        `  ${status.name}: ${behind}, ${incoming}`,
        ...status.anchor.incoming.map((commit) => `    ${commit.sha}  ${commit.author}  ${commit.subject}`),
        ...(drift ? [drift] : []),
      ];
    }),
  ];
  return sections.join("\n");
}

export function formatSubspacePushResults(results: SubspacePushResult[]) {
  const sections = [
    "Akan Subspace Push",
    "",
    ...results.flatMap((result) => {
      const detail =
        result.outcome === "pushed" ? `${result.commit} (${result.changedFiles} files)` : (result.reason ?? "");
      const [first = "", ...rest] = detail.split("\n");
      const pruned = result.prunedDependencies?.length
        ? [`    ${result.prunedDependencies.length} unused root dependenc(ies) left out of package.json`]
        : [];
      return [
        `  ${result.outcome.padEnd(8)} ${result.name}  ${first}`,
        ...rest.map((line) => `    ${line}`),
        ...pruned,
      ];
    }),
  ];
  return sections.join("\n");
}

export function formatSubspacePullResult(result: SubspacePullResult) {
  const sections = [
    `Akan Subspace Pull — ${result.name}`,
    "",
    `Customer commits since the last push (${result.incoming.length}):`,
    "",
    ...(result.incoming.length
      ? result.incoming.map((commit) => `  ${commit.sha}  ${commit.author}  ${commit.subject}`)
      : ["  (none — nothing to pull)"]),
    "",
    `Applied to the working tree, uncommitted (${result.applied.length}):`,
    "",
    ...(result.applied.length ? result.applied.map((file) => `  ${file}`) : ["  (none)"]),
    ...(result.libPatch
      ? [
          "",
          `Library edits NOT applied (${result.libPatch.files.length}) — review before adopting:`,
          "",
          ...result.libPatch.files.map((file) => `  ${file}`),
          "",
          `  patch: ${result.libPatch.path}`,
          "  adopt with: akan subspace pull <name> --adopt-libs",
        ]
      : []),
    ...(result.ignored.length
      ? ["", `Ignored (workspace-owned or subspace-owned): ${result.ignored.length} file(s)`]
      : []),
  ];
  return sections.join("\n");
}

export function formatSubspaceEnvUpload(result: SubspaceEnvUploadResult) {
  const sections = [
    `Akan Subspace Env Upload — ${result.name}`,
    `cloud workspace: ${result.workspaceId} · host: ${result.host}`,
    "",
    ...(result.outcome === "cancelled"
      ? ["  cancelled — the subspace's env archive is untouched."]
      : [
          `Uploaded (${result.files.length}), replacing that workspace's whole archive:`,
          "",
          ...result.files.map((file) => `  ${file}`),
          "",
          `  apps: ${result.apps.join(", ")}`,
          `  libs: ${result.libs.join(", ") || "(none)"}`,
        ]),
  ];
  return sections.join("\n");
}

export function formatSubspaceDiff(result: SubspaceDiffResult) {
  const total = result.app.files.length + result.libs.files.length;
  const sections = [
    `Akan Subspace Diff — ${result.name} (${result.branch})`,
    "what `akan subspace push` would change in the subspace",
    "",
    ...(total ? [] : ["  subspace is identical to the workspace for this slice."]),
    ...(result.libs.files.length
      ? [
          `LIBRARY changes (${result.libs.files.length}) — the subspace edited shared code:`,
          "",
          ...result.libs.files.map((file) => `  ${file}`),
          "",
          result.libs.patch,
        ]
      : []),
    ...(result.app.files.length
      ? [
          `App changes (${result.app.files.length}):`,
          "",
          ...result.app.files.map((file) => `  ${file}`),
          "",
          result.app.patch,
        ]
      : []),
  ];
  return sections.join("\n");
}

export function formatSubspacePlan(plan: SubspacePlan) {
  const list = (entries: string[]) => (entries.length ? entries.join(", ") : "(none)");
  const blockers = [plan.branchRefusal, plan.lockProblem].filter((reason): reason is string => !!reason);
  const sections = [
    `Akan Subspace Plan — ${plan.name} (${plan.branch})`,
    `repo: ${plan.repo}`,
    "what `akan subspace push` would ship, worked out from this checkout alone",
    "",
    `apps: ${list(plan.apps)}`,
    `libs: ${plan.libs.length ? "" : "(none)"}`.trimEnd(),
    ...plan.libs.map((lib) => `  - ${lib.name} (from ${lib.apps.join(", ")})`),
    `files under apps/ and libs/: ${plan.files}`,
    "",
    `root entries pushed: ${list(plan.rootEntries)}`,
    `root entries excluded: ${list(plan.excludedRootEntries)}`,
    `root entries the subspace keeps its own: ${list(plan.subspaceOwnedRootEntries)}`,
    "",
    `Root dependencies left out of package.json (${plan.prunedDependencies.length}):`,
    ...(plan.prunedDependencies.length ? plan.prunedDependencies.map((dep) => `  - ${dep}`) : ["  (none)"]),
    "",
    blockers.length ? "A push would be refused:" : "Nothing here would make a push refuse.",
    ...blockers.map((reason) => `  - ${reason}`),
    ...(plan.warnings.length
      ? ["", `Warnings (${plan.warnings.length}):`, ...plan.warnings.map((w) => `  - ${w}`)]
      : []),
  ];
  return sections.join("\n");
}

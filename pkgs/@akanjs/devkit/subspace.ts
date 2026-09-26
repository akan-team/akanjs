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

/**
 * One customer repo, mirrored from this workspace.
 *
 * Push is a squashed snapshot of the workspace's own tracked files, so a subspace's history never
 * carries the workspace's — which is also what keeps one customer's commit messages out of another's
 * repo. Pull is the reverse and rare: it compares the subspace against the last push it received rather
 * than against the workspace, so the diff is exactly the customer's own work however far the workspace
 * has moved on.
 */
export class Subspace {
  static readonly anchorFile = "akan.subspace.json";
  /** Never reaches a subspace: it names every other customer's repo. */
  static readonly workspaceOnlyEntries = ["akan.subspace.ts"];
  /** Workspace members, which are replaced wholesale rather than overlaid. */
  static readonly memberDirs = ["apps", "libs"];
  /** Subspace-owned in both directions: env values belong to the repo that deploys, not to the workspace. */
  static readonly subspaceOwnedDirs = ["env"];
  static readonly secretsMarkers = ["# akan:secrets (managed by akan.config.ts — do not edit)", "# akan:secrets:end"];
  static readonly holdDir = ".akan-subspace-hold";

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

  async branch() {
    return (await this.#git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  }

  async headSha() {
    return (await this.#git(["rev-parse", "--short", "HEAD"])).trim();
  }

  /** Adds the subspace as a remote if absent, then fetches the branch into this workspace's object store. */
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

  /**
   * The last push, located by the one file only a push writes. A tag or a recorded sha would have to be
   * kept in step by hand; this file is already in the subspace's history and cannot drift out of it.
   */
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

  #isSubspaceOwned(file: string) {
    const segments = file.split("/");
    if (!Subspace.memberDirs.includes(segments[0] ?? "")) return false;
    return Subspace.subspaceOwnedDirs.includes(segments[2] ?? "");
  }

  /**
   * A library manifest always differs: the subspace's copy carries the `akan.source` stamp a push writes and
   * the workspace's does not. Comparing it with that key removed is what keeps `status` and `diff` from
   * reporting every library as changed forever.
   */
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
        const manifest = JSON.parse(content) as Record<string, unknown>;
        delete manifest[LibSource.manifestKey];
        return JSON.stringify(manifest);
      } catch {
        return content;
      }
    };
    return normalize(theirs) !== normalize(ours);
  }

  async #meaningfulFiles(ref: string, files: string[]) {
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
    const diff = await this.#git(["diff", "--name-only", "HEAD", ref, "--", ...paths]);
    const behindPaths = await this.#meaningfulFiles(
      ref,
      diff
        .split("\n")
        .filter((file) => !!file.trim())
        .filter((file) => !this.#isSubspaceOwned(file)),
    );
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

  /**
   * Puts back only the files the workspace does not ship. The workspace still owns the tracked env switch files
   * (`env.server.ts` / `env.client.ts`), which is what keeps them in step; everything else under `env/` —
   * the per-environment values, which the workspace gitignores and never had — belongs to the subspace and wins.
   */
  async #restoreSubspaceOwned(held: { from: string; to: string }[]) {
    for (const { from, to } of held) await Subspace.#copyMissing(to, from);
    await rm(path.join(this.#clonePath, Subspace.holdDir), { recursive: true, force: true });
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

  /**
   * `git archive` emits exactly the tracked files at HEAD, which is why the copy needs no exclude list of
   * its own: generated barrels, the `(libs)`/`public/libs` symlinks, env values, secrets and the lockfile
   * are all outside git and cannot enter the archive. Spawned without a shell, whose quoting differs between
   * `sh` and `cmd.exe`.
   */
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

  /**
   * Verify-only, and an allowlist rather than a filter so no secret can reach a customer's clone even by
   * accident. `AKAN_PUBLIC_*` values are the ones akan embeds in every client bundle, so they are public
   * by construction; the cloud workspace id is pinned to `local` rather than copied.
   */
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

  /**
   * The CLI identifies a workspace root by `package.json` + `tsconfig.json` + `.env`, so a clone with no
   * `.env` cannot run `akan sync` at all — and one can never arrive with the slice, since every akan
   * workspace gitignores it and the subspace's real values are its own. Excluded through the clone's
   * `.git/info/exclude` rather than through the copied `.gitignore`: a workspace that omitted the pattern
   * would otherwise commit this file into the customer's repo.
   */
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

  /**
   * A workspace's root manifest is the union of every app it holds, so shipping it verbatim installs
   * every other customer's dependency tree in this repo. It is rebuilt from this subspace's own slices
   * instead, keeping the workspace's exact version specs.
   */
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
    for (const member of Subspace.memberDirs)
      await rm(path.join(this.#clonePath, member), { recursive: true, force: true });

    //* The shell is overlaid, never reconciled: a subspace owns its deployment (its own CI files and
    //* workflows live there), so a root entry the workspace does not have is left alone rather than deleted.
    await this.#extract(["."], ["apps/*", "libs/*", "pkgs/*"]);
    await this.#extract(paths);
    await this.#restoreSubspaceOwned(held);

    for (const entry of [...Subspace.workspaceOnlyEntries, ...this.#config.exclude])
      await rm(path.join(this.#clonePath, entry), { recursive: true, force: true });

    await this.#rewriteGitignore();
    const pruned = await this.#rewriteManifest(plans);
    await this.#rewriteWorkspaceSection(libs);
    await this.#writeLocalEnv();
    for (const lib of libs) await this.#stampLib(clone, lib, branch);
    return { libs, pruned };
  }

  /**
   * The `akan:secrets` block akan generates lists every app in the workspace by name, so it is filtered down to
   * this subspace's own apps. `bun.lock` is un-ignored because a subspace commits its lockfile — that is what
   * makes two subspaces on one branch resolve the same dependency tree rather than merely the same ranges.
   */
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

  /**
   * Written onto the clone's manifest directly rather than through `LibSource`, which addresses a library
   * by its position in the *workspace's* workspace. The hash follows the same rule — the library's own git files
   * with `env/` and the stamp itself left out — and is only written when it would change, so an
   * up-to-date subspace stays clean and the push is skipped.
   */
  async #stampLib(clone: Executor, lib: string, branch: string) {
    const manifestPath = path.join(this.#clonePath, "libs", lib, "package.json");
    if (!(await FileSys.fileExists(manifestPath))) return;
    const origin = `${this.#workspace.repoName}#${branch}`;
    const sha = await this.headSha();
    const [hash, previous] = await Promise.all([this.#hashLib(clone, lib), this.#committedStamp(clone, lib)]);
    const manifest = (await FileSys.readJson(manifestPath)) as Record<string, unknown>;
    const akan = (manifest[LibSource.manifestKey] ?? {}) as Record<string, unknown>;
    //* The extraction overwrote the manifest with the workspace's, stamp and all, so the previous stamp has to
    //* come from the clone's HEAD. Reusing its `syncedAt` when nothing else moved is what leaves the file
    //* byte-identical to what is committed — otherwise every push is dirty and none is ever skipped.
    const unchanged = previous?.origin === origin && previous.sha === sha && previous.hash === hash;
    const syncedAt = unchanged ? previous.syncedAt : new Date().toISOString();
    manifest[LibSource.manifestKey] = { ...akan, source: { origin, sha, hash, syncedAt } };
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
    //* `--cached` reads the clone's index, which the slice replaced the members without updating — so it still
    //* names every file the workspace has deleted or moved since the last push, and opening one throws. The
    //* index is only reconciled by the `git add -A` a push commits with, long after the stamp is written.
    const present = await Promise.all(
      candidates.map(async (file) => await FileSys.entryExists(path.join(this.#clonePath, file))),
    );
    const files = candidates.filter((_, index) => present[index]);
    const hasher = new Bun.CryptoHasher("sha256");
    for (const file of files) {
      const content = await FileSys.readText(path.join(this.#clonePath, file));
      hasher.update(file);
      hasher.update("\0");
      if (file === `libs/${lib}/package.json`) {
        const manifest = JSON.parse(content) as Record<string, unknown>;
        delete manifest[LibSource.manifestKey];
        hasher.update(JSON.stringify(manifest));
      } else hasher.update(content);
      hasher.update("\0");
    }
    return hasher.digest("hex").slice(0, 32);
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
    const pathspec = filter ? [filter] : scoped;
    const names = await this.#git(["diff", "--name-only", from, "HEAD", "--", ...pathspec]);
    const files = await this.#meaningfulFiles(
      from,
      names
        .split("\n")
        .filter((file) => !!file.trim())
        .filter((file) => !this.#isSubspaceOwned(file)),
    );
    if (!files.length) return { files: [], patch: "" };
    //? argv, not a shell: a route path such as `page/(docs)/…` would need quoting through one.
    return { files, patch: await this.#git(["diff", from, "HEAD", "--", ...files]) };
  }

  /**
   * Refuses the subspace rather than throwing, so one customer repo that fails to install or sync does not
   * abort the push to the rest of the subspaces. The env is passed explicitly so the child sees the values
   * written into the clone instead of inheriting the workspace's own.
   */
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
    await this.#writeAnchorFile(branch);
    await clone.spawn("git", ["add", "-A"]);
    const message = `chore(subspace): sync from ${this.#workspace.repoName}@${await this.headSha()}`;
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

  /**
   * A library hunk is never applied by default: the workspace is the one copy every other subspace is pushed from,
   * so adopting one customer's edit silently would ship it to all of them.
   */
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

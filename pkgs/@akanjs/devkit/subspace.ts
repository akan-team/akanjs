import { mkdir } from "node:fs/promises";
import path from "node:path";
import { toError } from "akanjs/common";
import { AppExecutor, type WorkspaceExecutor } from "./executors";
import { FileSys } from "./fileSys";
import { LibSource } from "./libSource";
import { SlicePlanner } from "./slicePlanner";
import { SubspaceClone } from "./subspaceClone";
import type { SubspaceConfig, SubspaceDeclaration } from "./subspaceConfig";

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
  branchRefusal: string | null;
  workspaceRefusal: string | null;
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
  //* The declaration file before `akan.config.ts`: it names every customer's repo, so a push removes any copy of it.
  static readonly retiredConfigFile = "akan.subspace.ts";
  static readonly #retiredConfigRefusal =
    `${Subspace.retiredConfigFile} is no longer read: move it under \`subspace\` in akan.config.ts and delete it`;
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

  async #git(args: string[]) {
    return await this.#workspace.spawn("git", args);
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
    const commit = (await this.#git(["log", "-1", "--format=%H", ref, "--", SubspaceClone.anchorFile])).trim();
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
    const workspaceRefusal = await this.#workspaceRefusal();
    const { plans, libs } = await this.slice();
    const rootFiles = plans[0]?.rootFiles ?? [];
    const present = new Set(SlicePlanner.rootEntriesOf(rootFiles));
    const owned = SubspaceClone.subspaceOwnedRootEntries;
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
      branchRefusal = toError(error).message;
    }
    return {
      name: this.name,
      repo: this.#declaration.repo,
      branch,
      branchRefusal,
      workspaceRefusal,
      apps: [...this.#declaration.apps],
      libs: libs.map((lib) => ({
        name: lib,
        apps: plans.filter((plan) => plan.libs.includes(lib)).map((plan) => plan.app),
      })),
      files:
        plans.reduce((sum, plan) => sum + plan.appFiles.length, 0) +
        [...libFiles.values()].reduce((sum, files) => sum + files.length, 0),
      rootEntries: [...present]
        .filter((entry) => !excludedTops.has(entry) && !owned.includes(entry) && entry !== Subspace.retiredConfigFile)
        .sort((a, b) => a.localeCompare(b)),
      excludedRootEntries: excluded,
      subspaceOwnedRootEntries: owned.filter((entry) => present.has(entry)),
      prunedDependencies: pruned,
      lockProblem: await this.#headLockProblem(),
      warnings: [...new Set([...plans.flatMap((plan) => plan.warnings), ...warnings])],
    };
  }

  static planBlockers(plan: SubspacePlan) {
    return [plan.branchRefusal, plan.workspaceRefusal, plan.lockProblem].filter((reason): reason is string => !!reason);
  }

  async #retiredConfigLeft() {
    return await FileSys.fileExists(path.join(this.#workspace.workspaceRoot, Subspace.retiredConfigFile));
  }

  async #workspaceRefusal() {
    if (await this.#retiredConfigLeft()) return Subspace.#retiredConfigRefusal;
    return (await this.#workspace.hasChanges()) ? "workspace working tree is dirty" : null;
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
      .filter((file) => !!file.trim() && !SubspaceClone.isSubspaceOwned(file));
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
  static #loopbackRegistryProblem(lock: string | null) {
    const registry = lock?.match(Subspace.#loopbackRegistry)?.[0];
    return registry
      ? `bun.lock resolves packages from ${registry}, a registry only this machine reaches; reinstall from a public registry and commit that lock first`
      : null;
  }

  async #headLockProblem() {
    return Subspace.#loopbackRegistryProblem(await this.#git(["show", "HEAD:bun.lock"]).catch(() => null));
  }

  async push(branch: string, { verify = true }: { verify?: boolean } = {}): Promise<SubspacePushResult> {
    this.#config.assertPushable(branch);
    const refusal = (await this.#workspaceRefusal()) ?? (await this.#headLockProblem());
    if (refusal) return { name: this.name, outcome: "refused", reason: refusal, changedFiles: 0 };
    if (!(await this.fetch(branch)))
      return { name: this.name, outcome: "refused", reason: `subspace has no branch "${branch}"`, changedFiles: 0 };

    const clone = await SubspaceClone.open(this.#workspace, this.#declaration, branch);
    const { pruned } = await clone.applySlice(await this.slice(), {
      branch,
      sha: await this.headSha(),
      remove: [Subspace.retiredConfigFile, ...this.#config.exclude],
    });

    const changedFiles = await clone.changedFiles();
    if (!changedFiles)
      return {
        name: this.name,
        outcome: "skipped",
        reason: "already up to date",
        changedFiles: 0,
        prunedDependencies: pruned,
      };

    if (verify) {
      const failure = await clone.verify();
      if (failure) return { name: this.name, outcome: "refused", reason: failure, changedFiles };
    }
    //? Rechecked on the clone: the verifying `bun install` may resolve packages from this machine's registry into it.
    const lockProblem = Subspace.#loopbackRegistryProblem(await clone.lock());
    if (lockProblem) return { name: this.name, outcome: "refused", reason: lockProblem, changedFiles };
    return {
      name: this.name,
      outcome: "pushed",
      commit: await clone.commit(branch, await this.headSha()),
      changedFiles,
      prunedDependencies: pruned,
    };
  }

  async pull(branch: string, { adoptLibs = false }: { adoptLibs?: boolean } = {}): Promise<SubspacePullResult> {
    if (await this.#retiredConfigLeft()) throw new Error(Subspace.#retiredConfigRefusal);
    if (!(await this.fetch(branch))) throw new Error(`Subspace "${this.name}" has no branch "${branch}"`);
    const anchor = await this.anchor(branch);
    if (!anchor.commit)
      throw new Error(`Subspace "${this.name}" carries no ${SubspaceClone.anchorFile} — it has never received a push`);
    if (!anchor.incoming.length) return { name: this.name, applied: [], libPatch: null, ignored: [], incoming: [] };

    const range = `${anchor.commit}..${this.#remote}/${branch}`;
    const changed = (await this.#git(["diff", "--name-only", range])).split("\n").filter((file) => !!file.trim());
    const appPrefixes = this.#declaration.apps.map((app) => `apps/${app}/`);
    const appFiles = changed.filter(
      (file) => appPrefixes.some((prefix) => file.startsWith(prefix)) && !SubspaceClone.isSubspaceOwned(file),
    );
    const libFiles = changed.filter((file) => file.startsWith("libs/") && !SubspaceClone.isSubspaceOwned(file));
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

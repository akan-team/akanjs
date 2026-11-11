import type { LibExecutor } from "../executors";
import type { PackageJson } from "./types";

export interface LibSourceStamp {
  /** Where the copy came from: a git remote URL, or `akanjs` for the published package. */
  origin: string;
  /** The origin's commit sha, or the package version when the origin is a registry. */
  sha: string;
  /** Content hash of the library as installed, so a later edit is detectable without the origin. */
  hash: string;
  syncedAt: string;
}

export type LibDrift = "clean" | "drifted" | "unstamped";

export interface LibStatus {
  lib: string;
  drift: LibDrift;
  stamp: LibSourceStamp | null;
  hash: string;
}

// In package.json, not a file of its own: every akan manifest write spreads the existing object, so the key survives.
export class LibSource {
  static readonly manifestKey = "akan";
  // `env/` holds the installing workspace's per-deployment values, so an env edit is not drift.
  static readonly unhashedDirs = ["env"];

  #lib: LibExecutor;
  constructor(lib: LibExecutor) {
    this.#lib = lib;
  }

  get #prefix() {
    return `libs/${this.#lib.name}/`;
  }

  #isHashed(file: string) {
    const relative = file.slice(this.#prefix.length);
    return !LibSource.unhashedDirs.includes(relative.split("/")[0] ?? "");
  }

  static unstamped(manifestContent: string) {
    const manifest = JSON.parse(manifestContent) as PackageJson;
    delete manifest[LibSource.manifestKey];
    return JSON.stringify(manifest);
  }

  //* `package.json` cannot hash the stamp it carries, so the key comes off before hashing.
  static async hashFiles(files: string[], manifestFile: string, read: (file: string) => Promise<string>) {
    const hasher = new Bun.CryptoHasher("sha256");
    for (const file of files) {
      const content = await read(file);
      hasher.update(file);
      hasher.update("\0");
      hasher.update(file === manifestFile ? LibSource.unstamped(content) : content);
      hasher.update("\0");
    }
    return hasher.digest("hex").slice(0, 32);
  }

  // Untracked files count: a freshly copied library is not committed yet.
  async computeHash() {
    const files = (await this.#lib.workspace.listGitFiles([`libs/${this.#lib.name}`], { untracked: true })).filter(
      (file) => this.#isHashed(file),
    );
    return await LibSource.hashFiles(files, `${this.#prefix}package.json`, (file) =>
      this.#lib.workspace.readFile(file),
    );
  }

  async read(): Promise<LibSourceStamp | null> {
    const manifest = await this.#lib.getPackageJson();
    const akan = manifest[LibSource.manifestKey] as { source?: LibSourceStamp } | undefined;
    return akan?.source ?? null;
  }

  async write({ origin, sha }: Pick<LibSourceStamp, "origin" | "sha">) {
    const [manifest, hash] = await Promise.all([this.#lib.getPackageJson(), this.computeHash()]);
    const akan = (manifest[LibSource.manifestKey] ?? {}) as Record<string, unknown>;
    const stamp: LibSourceStamp = { origin, sha, hash, syncedAt: new Date().toISOString() };
    await this.#lib.setPackageJson({ ...manifest, [LibSource.manifestKey]: { ...akan, source: stamp } });
    return stamp;
  }

  // `syncedAt` moves on every write, so an unchanged stamp is left alone (the hash excludes the stamp itself).
  async syncStamp({ origin, sha }: Pick<LibSourceStamp, "origin" | "sha">) {
    const [current, hash] = await Promise.all([this.read(), this.computeHash()]);
    if (current?.origin === origin && current.sha === sha && current.hash === hash)
      return { stamp: current, changed: false };
    return { stamp: await this.write({ origin, sha }), changed: true };
  }

  async status(): Promise<LibStatus> {
    const [stamp, hash] = await Promise.all([this.read(), this.computeHash()]);
    const drift = !stamp ? "unstamped" : stamp.hash === hash ? "clean" : "drifted";
    return { lib: this.#lib.name, drift, stamp, hash };
  }
}

export function formatLibStatuses(statuses: LibStatus[]) {
  const marks = { clean: "clean    ", drifted: "DRIFTED  ", unstamped: "unstamped" } as const;
  const sections = [
    "Akan Library Source Status",
    "",
    ...statuses.map((status) => {
      const origin = status.stamp ? `${status.stamp.origin}@${status.stamp.sha}` : "no akan.source in package.json";
      return `  ${marks[status.drift]} libs/${status.lib}  ${origin}`;
    }),
    "",
    `drifted: ${statuses.filter((status) => status.drift === "drifted").length} / ${statuses.length}`,
  ];
  return sections.join("\n");
}

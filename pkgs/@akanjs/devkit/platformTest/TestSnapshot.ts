import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SnapshotDrift {
  changed: string[];
  added: string[];
  removed: string[];
}

/**
 * The exact bytes a platform run tests: every tracked file plus every untracked one git would show, which is
 * what `akan deploy-akan` goes on to build and publish. The per-file hashes are kept so the tree can be
 * compared again before publishing — a test run is only a gate if nothing changed underneath it.
 */
export class TestSnapshot {
  static readonly #secretPatterns = [
    /(^|\/)\.env(\.(?!(template|example|sample)$)[^/]+)?$/,
    /(^|\/)env\/env\.(client|server)\.(?!(type|example)\.ts$)[^/]+\.ts$/,
  ];

  readonly root: string;
  readonly tarPath: string;
  readonly digest: string;
  readonly #hashes: Map<string, string>;

  constructor(root: string, tarPath: string, hashes: Map<string, string>) {
    this.root = root;
    this.tarPath = tarPath;
    this.#hashes = hashes;
    this.digest = TestSnapshot.#digestOf(hashes);
  }

  get fileCount() {
    return this.#hashes.size;
  }

  static async create(root: string, outDir: string) {
    const hashes = await TestSnapshot.#hashTree(root);
    //? A tracked file is already in the repository; only an untracked one nobody ignored can leak by being copied.
    const untracked = await TestSnapshot.#gitList(root, ["--others", "--exclude-standard"]);
    const secrets = untracked.filter((file) => TestSnapshot.#secretPatterns.some((re) => re.test(file)));
    if (secrets.length)
      throw new Error(
        `Refusing to snapshot env files git does not ignore — they would be copied to every test target: ${secrets.join(", ")}`,
      );
    await mkdir(outDir, { recursive: true });
    const listPath = path.join(outDir, "files.txt");
    const tarPath = path.join(outDir, "src.tar");
    await writeFile(listPath, `${[...hashes.keys()].join("\n")}\n`);
    const tar = Bun.spawn(
      ["tar", ...(process.platform === "darwin" ? ["--no-xattrs"] : []), "-cf", tarPath, "-T", listPath],
      { cwd: root, env: { ...process.env, COPYFILE_DISABLE: "1" }, stdout: "ignore", stderr: "pipe" },
    );
    if ((await tar.exited) !== 0) throw new Error(`tar failed: ${await new Response(tar.stderr).text()}`);
    return new TestSnapshot(root, tarPath, hashes);
  }

  async drift(): Promise<SnapshotDrift> {
    const current = await TestSnapshot.#hashTree(this.root);
    const changed = [...current].filter(([file, hash]) => this.#hashes.has(file) && this.#hashes.get(file) !== hash);
    return {
      changed: changed.map(([file]) => file),
      added: [...current.keys()].filter((file) => !this.#hashes.has(file)),
      removed: [...this.#hashes.keys()].filter((file) => !current.has(file)),
    };
  }

  static async #gitList(root: string, args: string[]) {
    const proc = Bun.spawn(["git", "ls-files", ...args, "-z"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) throw new Error(`git ls-files failed in ${root}: ${stderr.trim()}`);
    return [...new Set(stdout.split("\0").filter(Boolean))].sort();
  }

  static async #listFiles(root: string) {
    const listed = await TestSnapshot.#gitList(root, ["--cached", "--others", "--exclude-standard"]);
    //? `--cached` still lists a tracked file deleted from the working tree, which tar would then fail on.
    const present = await Promise.all(
      listed.map(async (file) => ((await stat(path.join(root, file)).catch(() => null))?.isFile() ? file : null)),
    );
    return present.filter((file): file is string => file !== null);
  }

  static async #hashTree(root: string) {
    const files = await TestSnapshot.#listFiles(root);
    const hashes = new Map<string, string>();
    for (let start = 0; start < files.length; start += 64) {
      const batch = files.slice(start, start + 64);
      const batchHashes = await Promise.all(
        batch.map(async (file) => Bun.hash(await Bun.file(path.join(root, file)).bytes()).toString(16)),
      );
      for (const [idx, file] of batch.entries()) hashes.set(file, batchHashes[idx] ?? "");
    }
    return hashes;
  }

  static #digestOf(hashes: Map<string, string>) {
    return Bun.hash([...hashes].map(([file, hash]) => `${file}:${hash}`).join("\n"))
      .toString(16)
      .padStart(16, "0")
      .slice(0, 12);
  }
}

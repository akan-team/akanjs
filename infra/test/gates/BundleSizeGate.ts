import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Gate, GateRow, Measurements } from "./gate";

/**
 * The bytes a built app ships, per entry and per group of files whose names carry a hash. A rise past the larger of
 * 1% and 4KB fails; the slack absorbs a version string or a renamed chunk, not a dependency pulled into the image.
 */
export class BundleSizeGate implements Gate {
  readonly name = "bundle-size";
  readonly recordsBaseline = true;
  static readonly #relativeSlack = 0.01;
  static readonly #absoluteSlack = 4096;
  static readonly #entries = ["main.js", "server.js", "rscWorker.js", "console-runtime.js"];
  readonly #distDir: string;
  readonly #metaDir: string;

  constructor(root: string, app = "minimal") {
    this.#distDir = path.join(root, "dist", "apps", app);
    this.#metaDir = path.join(root, "local", "build-meta", app);
  }

  /** The inputs that put the most bytes into an entry, read off the metafile `AKAN_BUILD_METAFILE=1` builds write. */
  async contributors(entry: string, limit = 10): Promise<{ input: string; bytes: number }[]> {
    const file = Bun.file(path.join(this.#metaDir, `${path.parse(entry).name}.json`));
    if (!(await file.exists())) return [];
    const { outputs } = (await file.json()) as {
      outputs: Record<string, { inputs: Record<string, { bytesInOutput: number }> }>;
    };
    const bytesByInput = new Map<string, number>();
    for (const output of Object.values(outputs))
      for (const [input, { bytesInOutput }] of Object.entries(output.inputs))
        bytesByInput.set(input, (bytesByInput.get(input) ?? 0) + bytesInOutput);
    return [...bytesByInput]
      .map(([input, bytes]) => ({ input, bytes }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, limit);
  }

  static async #sizeOf(file: string) {
    return (await stat(file).catch(() => null))?.size ?? 0;
  }

  static async #treeSize(dir: string): Promise<number> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    let total = 0;
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      total += entry.isDirectory() ? await BundleSizeGate.#treeSize(full) : await BundleSizeGate.#sizeOf(full);
    }
    return total;
  }

  async measure(): Promise<Measurements> {
    if (!(await Bun.file(path.join(this.#distDir, "main.js")).exists()))
      throw new Error(`${this.#distDir} has no main.js: run \`bun run akan build minimal\` first, or pass --build`);
    const measured: Measurements = {};
    for (const entry of BundleSizeGate.#entries)
      measured[entry] = await BundleSizeGate.#sizeOf(path.join(this.#distDir, entry));
    const files = await readdir(this.#distDir);
    const chunks = files.filter((file) => /^chunk-.+\.js$/.test(file));
    measured["chunk-*.js"] = (
      await Promise.all(chunks.map((file) => BundleSizeGate.#sizeOf(path.join(this.#distDir, file))))
    ).reduce((sum, size) => sum + size, 0);
    measured["public/"] = await BundleSizeGate.#treeSize(path.join(this.#distDir, "public"));
    measured["csr/"] = await BundleSizeGate.#treeSize(path.join(this.#distDir, "csr"));
    return measured;
  }

  check(measured: Measurements, baseline: Measurements | undefined): GateRow[] {
    return Object.entries(measured).map(([metric, value]) => {
      const recorded = baseline?.[metric] ?? null;
      const slack =
        recorded === null
          ? 0
          : Math.max(Math.ceil(recorded * BundleSizeGate.#relativeSlack), BundleSizeGate.#absoluteSlack);
      return { metric, value, baseline: recorded, limit: recorded === null ? null : recorded + slack, unit: "bytes" };
    });
  }
}

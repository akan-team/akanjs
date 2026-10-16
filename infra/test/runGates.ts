import path from "node:path";
import { BundleSizeGate } from "./gates/BundleSizeGate";
import type { Gate, GateRow, Measurements } from "./gates/gate";
import { HeapGate } from "./gates/HeapGate";
import { ScalingGate } from "./gates/ScalingGate";
import { TypePerfGate } from "./gates/TypePerfGate";

/**
 * Regression gates that a unit test cannot hold: how much work the type checker does on `apps/minimal`, the bytes its
 * build ships, whether boot stays linear in the number of modules, and whether a signal call leaks.
 *
 *   bun run testGates                       every gate, against infra/test/gates/baselines.json
 *   bun run testGates --only=type,bundle    some of them (type, bundle, scaling, heap)
 *   bun run testGates --build               run `akan build minimal` before the bundle gate
 *   bun run testGates --update              record this run's type and bundle numbers as the new baseline
 *
 * Exits non-zero when a metric passes its limit. A deliberate rise is recorded with `--update` in the same change.
 */
class GateRun {
  static readonly #root = path.resolve(import.meta.dir, "../..");
  static readonly #baselinePath = path.join(import.meta.dir, "gates", "baselines.json");
  readonly #only: Set<string> | null;
  readonly #build: boolean;
  readonly #update: boolean;

  constructor(args: string[]) {
    const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
    this.#only = only ? new Set(only.split(",")) : null;
    this.#build = args.includes("--build");
    this.#update = args.includes("--update");
  }

  #gates(): [string, Gate][] {
    const all: [string, Gate][] = [
      ["type", new TypePerfGate(GateRun.#root)],
      ["bundle", new BundleSizeGate(GateRun.#root)],
      ["scaling", new ScalingGate(GateRun.#root)],
      ["heap", new HeapGate(GateRun.#root)],
    ];
    return all.filter(([key]) => !this.#only || this.#only.has(key));
  }

  static #format(value: number, unit: GateRow["unit"]) {
    if (unit === "ratio") return value.toFixed(2);
    if (unit === "ms") return `${Math.round(value)}ms`;
    if (unit === "bytes") {
      if (value >= 10_240) return `${(value / 1024).toFixed(1)}KB`;
      return value >= 10 ? `${Math.round(value)}B` : `${value.toFixed(2)}B`;
    }
    return String(Math.round(value));
  }

  async #buildApp() {
    const proc = Bun.spawn(["bun", "run", "akan", "build", "minimal"], {
      cwd: GateRun.#root,
      env: { ...process.env, AKAN_BUILD_METAFILE: "1" },
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await proc.exited) !== 0) throw new Error("akan build minimal failed");
  }

  async run() {
    const baselineFile = Bun.file(GateRun.#baselinePath);
    const baselines = ((await baselineFile.exists()) ? await baselineFile.json() : {}) as Record<string, Measurements>;
    if (this.#build && (!this.#only || this.#only.has("bundle"))) await this.#buildApp();
    let failed = false;
    for (const [, gate] of this.#gates()) {
      const measured = await gate.measure();
      const rows = gate.check(measured, baselines[gate.name]);
      console.info(`\n${gate.name}`);
      for (const row of rows) {
        const over = row.limit !== null && row.value > row.limit;
        failed ||= over && !this.#update;
        const baseline = row.baseline === null ? "" : `  baseline ${GateRun.#format(row.baseline, row.unit)}`;
        const limit = row.limit === null ? "" : `  limit ${GateRun.#format(row.limit, row.unit)}`;
        console.info(
          `  ${over ? "FAIL" : "ok  "} ${row.metric.padEnd(24)} ${GateRun.#format(row.value, row.unit).padStart(10)}${baseline}${limit}`,
        );
        if (over && gate instanceof BundleSizeGate)
          for (const { input, bytes } of await gate.contributors(row.metric))
            console.info(`         ${GateRun.#format(bytes, "bytes").padStart(10)}  ${input}`);
      }
      if (this.#update && gate.recordsBaseline) baselines[gate.name] = measured;
    }
    if (this.#update) {
      await Bun.write(GateRun.#baselinePath, `${JSON.stringify(baselines, null, 2)}\n`);
      console.info(`\nrecorded ${path.relative(GateRun.#root, GateRun.#baselinePath)}`);
    }
    if (failed) process.exit(1);
  }
}

await new GateRun(process.argv.slice(2)).run();

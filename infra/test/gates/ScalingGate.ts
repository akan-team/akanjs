import type { Gate, GateRow, Measurements } from "./gate";
import { ProbeRunner } from "./probeRunner";

/**
 * Boots N and 2N database modules and compares the time each stage took. Linear work doubles; a stage that walks every
 * module once per module quadruples. Judged by the ratio alone, so a faster or slower machine moves both sides.
 */
export class ScalingGate implements Gate {
  readonly name = "scaling";
  readonly recordsBaseline = false;
  static readonly #limit = 2.75;
  static readonly #modules = 150;
  static readonly #runs = 5;
  static readonly #stages = ["declareMs", "wireMs", "catalogueMs", "totalMs"] as const;
  readonly #probe: ProbeRunner;

  constructor(root: string) {
    this.#probe = new ProbeRunner(root);
  }

  async #medians(modules: number) {
    const runs: Record<string, number>[] = [];
    for (let idx = 0; idx < ScalingGate.#runs; idx += 1)
      runs.push(await this.#probe.run("scalingProbe.ts", ["--modules", String(modules)]));
    return Object.fromEntries(
      ScalingGate.#stages.map((stage) => [stage, ProbeRunner.median(runs.map((run) => run[stage] ?? 0))]),
    );
  }

  async measure(): Promise<Measurements> {
    const single = await this.#medians(ScalingGate.#modules);
    const double = await this.#medians(ScalingGate.#modules * 2);
    const measured: Measurements = {};
    for (const stage of ScalingGate.#stages) {
      measured[`${stage}@${ScalingGate.#modules}`] = single[stage] ?? 0;
      measured[`${stage}@${ScalingGate.#modules * 2}`] = double[stage] ?? 0;
      measured[`${stage} ratio`] = (double[stage] ?? 0) / Math.max(single[stage] ?? 0, 0.001);
    }
    return measured;
  }

  // The declare stage takes a few milliseconds, where scheduler noise alone can move its ratio past any limit.
  check(measured: Measurements): GateRow[] {
    return ScalingGate.#stages.map((stage) => ({
      metric: `${stage.replace("Ms", "")} ${ScalingGate.#modules}→${ScalingGate.#modules * 2}`,
      value: measured[`${stage} ratio`] ?? 0,
      baseline: null,
      limit: stage === "declareMs" ? null : ScalingGate.#limit,
      unit: "ratio",
    }));
  }
}

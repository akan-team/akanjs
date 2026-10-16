import type { Gate, GateRow, Measurements } from "./gate";
import { ProbeRunner } from "./probeRunner";

/**
 * Whether a signal call keeps anything once it has answered. The steady state reads well under a byte a call; one
 * object kept per call is tens of bytes, so the limit sits between the two and needs no baseline.
 */
export class HeapGate implements Gate {
  readonly name = "heap";
  readonly recordsBaseline = false;
  static readonly #limitBytesPerCall = 8;
  static readonly #runs = 3;
  readonly #probe: ProbeRunner;

  constructor(root: string) {
    this.#probe = new ProbeRunner(root);
  }

  async measure(): Promise<Measurements> {
    const runs: Record<string, number>[] = [];
    for (let idx = 0; idx < HeapGate.#runs; idx += 1) runs.push(await this.#probe.run("heapProbe.ts"));
    return {
      retainedBytesPerCall: ProbeRunner.median(runs.map((run) => run.retainedBytesPerCall ?? 0)),
      heapBytes: ProbeRunner.median(runs.map((run) => run.heapBytes ?? 0)),
    };
  }

  check(measured: Measurements): GateRow[] {
    return [
      {
        metric: "retained per call",
        value: measured.retainedBytesPerCall,
        baseline: null,
        limit: HeapGate.#limitBytesPerCall,
        unit: "bytes",
      },
      { metric: "heap after", value: measured.heapBytes, baseline: null, limit: null, unit: "bytes" },
    ];
  }
}

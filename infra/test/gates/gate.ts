export type Measurements = Record<string, number>;

export interface GateRow {
  metric: string;
  value: number;
  /** The recorded value this run is compared with; `null` for a metric judged against a fixed limit only. */
  baseline: number | null;
  /** The most the value may be; `null` for a metric that is reported and never fails the run. */
  limit: number | null;
  unit: "count" | "bytes" | "ms" | "ratio";
}

export interface Gate {
  readonly name: string;
  /** Whether `--update` records this gate's measurements as the new baseline. */
  readonly recordsBaseline: boolean;
  measure(): Promise<Measurements>;
  check(measured: Measurements, baseline: Measurements | undefined): GateRow[];
}

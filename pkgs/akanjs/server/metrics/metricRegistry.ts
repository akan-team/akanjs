import { AkanError } from "akanjs/base";
import type { AkanMetricFamily } from "akanjs/service";

export type MetricLabels = Readonly<Record<string, string>>;

export const LATENCY_BUCKETS_SECONDS: readonly number[] = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];
export const OVERFLOW_LABEL_VALUE = "other";
export const MAX_LABEL_VALUES = 2_000;

const METRIC_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const RESERVED_LABELS = new Set(["le", "role"]);

export class LabelValues {
  readonly #values = new Set<string>();
  readonly #limit: number;

  constructor(limit = MAX_LABEL_VALUES) {
    this.#limit = limit;
  }

  admit(value: string): string {
    if (this.#values.has(value)) return value;
    if (this.#values.size >= this.#limit) return OVERFLOW_LABEL_VALUE;
    this.#values.add(value);
    return value;
  }
}

export class CounterSeries {
  value = 0;

  inc(by = 1) {
    this.value += by;
  }
}

export class GaugeSeries {
  value = 0;

  set(value: number) {
    this.value = value;
  }

  inc(by = 1) {
    this.value += by;
  }

  dec(by = 1) {
    this.value -= by;
  }
}

export class HistogramSeries {
  readonly bounds: readonly number[];
  readonly counts: Float64Array;
  sum = 0;
  count = 0;

  constructor(bounds: readonly number[]) {
    this.bounds = bounds;
    this.counts = new Float64Array(bounds.length + 1);
  }

  observe(value: number) {
    const bounds = this.bounds;
    let idx = 0;
    while (idx < bounds.length && value > bounds[idx]) idx++;
    this.counts[idx] += 1;
    this.sum += value;
    this.count += 1;
  }
}

class SeriesTable<S> {
  readonly labelNames: readonly string[];
  readonly #values: LabelValues[];
  readonly #create: () => S;
  readonly #entries = new Map<string, { labels: MetricLabels; series: S }>();

  constructor(labelNames: readonly string[], create: () => S) {
    this.labelNames = labelNames;
    this.#values = labelNames.map(() => new LabelValues());
    this.#create = create;
  }

  get(labels: MetricLabels): S {
    const values = this.labelNames.map((name, idx) => this.#values[idx].admit(labels[name] ?? ""));
    const key = values.join("\u0000");
    const existing = this.#entries.get(key);
    if (existing) return existing.series;
    const entry = {
      labels: Object.fromEntries(this.labelNames.map((name, idx) => [name, values[idx]])),
      series: this.#create(),
    };
    this.#entries.set(key, entry);
    return entry.series;
  }

  entries() {
    return this.#entries.values();
  }
}

interface MetricInfo {
  name: string;
  help: string;
  labelNames: readonly string[];
}

export class Counter {
  readonly type = "counter";
  readonly name: string;
  readonly help: string;
  readonly #table: SeriesTable<CounterSeries>;

  constructor({ name, help, labelNames }: MetricInfo) {
    this.name = name;
    this.help = help;
    this.#table = new SeriesTable(labelNames, () => new CounterSeries());
  }

  get labelNames() {
    return this.#table.labelNames;
  }

  series(labels: MetricLabels = {}) {
    return this.#table.get(labels);
  }

  inc(labels: MetricLabels = {}, by = 1) {
    this.#table.get(labels).inc(by);
  }

  snapshot(constLabels: MetricLabels): AkanMetricFamily {
    const samples = [...this.#table.entries()].map(({ labels, series }) => ({
      labels: { ...constLabels, ...labels },
      value: series.value,
    }));
    return { name: this.name, help: this.help, type: "counter", samples };
  }
}

export class Gauge {
  readonly type = "gauge";
  readonly name: string;
  readonly help: string;
  readonly #table: SeriesTable<GaugeSeries>;

  constructor({ name, help, labelNames }: MetricInfo) {
    this.name = name;
    this.help = help;
    this.#table = new SeriesTable(labelNames, () => new GaugeSeries());
  }

  get labelNames() {
    return this.#table.labelNames;
  }

  series(labels: MetricLabels = {}) {
    return this.#table.get(labels);
  }

  set(value: number, labels: MetricLabels = {}) {
    this.#table.get(labels).set(value);
  }

  snapshot(constLabels: MetricLabels): AkanMetricFamily {
    const samples = [...this.#table.entries()].map(({ labels, series }) => ({
      labels: { ...constLabels, ...labels },
      value: series.value,
    }));
    return { name: this.name, help: this.help, type: "gauge", samples };
  }
}

export class Histogram {
  readonly type = "histogram";
  readonly name: string;
  readonly help: string;
  readonly buckets: readonly number[];
  readonly #table: SeriesTable<HistogramSeries>;

  constructor({ name, help, labelNames }: MetricInfo, buckets: readonly number[]) {
    this.name = name;
    this.help = help;
    this.buckets = buckets;
    this.#table = new SeriesTable(labelNames, () => new HistogramSeries(buckets));
  }

  get labelNames() {
    return this.#table.labelNames;
  }

  series(labels: MetricLabels = {}) {
    return this.#table.get(labels);
  }

  observe(value: number, labels: MetricLabels = {}) {
    this.#table.get(labels).observe(value);
  }

  snapshot(constLabels: MetricLabels): AkanMetricFamily {
    const samples = [...this.#table.entries()].map(({ labels, series }) => ({
      labels: { ...constLabels, ...labels },
      counts: [...series.counts],
      sum: series.sum,
      count: series.count,
    }));
    return { name: this.name, help: this.help, type: "histogram", buckets: [...this.buckets], samples };
  }
}

type Metric = Counter | Gauge | Histogram;

export class MetricRegistry {
  readonly #metrics = new Map<string, Metric>();

  counter(name: string, help: string, labelNames: readonly string[] = []): Counter {
    if (!name.endsWith("_total")) throw MetricRegistry.#invalid(`Counter ${name} must end in _total.`);
    return this.#register("counter", { name, help, labelNames }, () => new Counter({ name, help, labelNames }));
  }

  gauge(name: string, help: string, labelNames: readonly string[] = []): Gauge {
    return this.#register("gauge", { name, help, labelNames }, () => new Gauge({ name, help, labelNames }));
  }

  histogram(
    name: string,
    help: string,
    labelNames: readonly string[] = [],
    buckets: readonly number[] = LATENCY_BUCKETS_SECONDS,
  ): Histogram {
    if (!buckets.length || buckets.some((bound, idx) => idx > 0 && bound <= buckets[idx - 1]))
      throw MetricRegistry.#invalid(`Histogram ${name} needs increasing bucket bounds.`);
    return this.#register(
      "histogram",
      { name, help, labelNames },
      () => new Histogram({ name, help, labelNames }, buckets),
    );
  }

  snapshot(constLabels: MetricLabels = {}): AkanMetricFamily[] {
    return [...this.#metrics.values()].map((metric) => metric.snapshot(constLabels));
  }

  //? By `type`, not `instanceof`: a second copy of this module in the process shares the registry, not the classes.
  #register<M extends Metric>(type: M["type"], info: MetricInfo, create: () => M): M {
    const existing = this.#metrics.get(info.name);
    if (existing) {
      if (existing.type !== type || existing.labelNames.join() !== info.labelNames.join())
        throw MetricRegistry.#invalid(`Metric ${info.name} is already registered with another type or labels.`);
      return existing as M;
    }
    if (!METRIC_NAME.test(info.name)) throw MetricRegistry.#invalid(`Metric name ${info.name} is not valid.`);
    const badLabel = info.labelNames.find((label) => !LABEL_NAME.test(label) || RESERVED_LABELS.has(label));
    if (badLabel !== undefined) throw MetricRegistry.#invalid(`Metric ${info.name} cannot take the label ${badLabel}.`);
    const metric = create();
    this.#metrics.set(info.name, metric);
    return metric;
  }

  static #invalid(message: string) {
    return new AkanError("invalidMetric", message);
  }
}

// Pinned to `process`, as the trace aggregator is: the app bundle and the framework runtime may each load this module.
const metricProcessStore = process as unknown as { __akanMetricRegistry?: MetricRegistry };
metricProcessStore.__akanMetricRegistry ??= new MetricRegistry();
export const metricRegistry: MetricRegistry = metricProcessStore.__akanMetricRegistry;

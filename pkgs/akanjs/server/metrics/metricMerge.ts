import type { AkanHistogramSample, AkanMetricFamily, AkanMetricSample } from "akanjs/service";

type ScalarFamily = Extract<AkanMetricFamily, { type: "counter" | "gauge" }>;
type HistogramFamily = Extract<AkanMetricFamily, { type: "histogram" }>;

const keyOf = (labels: Record<string, string>) =>
  Object.keys(labels)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => `${name}\u0000${labels[name]}`)
    .join("\u0001");

//? A gauge adds up as well, so a pending count reads as the total across processes, never as an average.
export class MetricMerge {
  readonly #order = new Map<string, AkanMetricFamily["type"]>();
  readonly #scalars = new Map<string, { family: ScalarFamily; samples: Map<string, AkanMetricSample> }>();
  readonly #histograms = new Map<string, { family: HistogramFamily; samples: Map<string, AkanHistogramSample> }>();

  add(
    families: readonly AkanMetricFamily[],
    { gauges = true, labels = {} }: { gauges?: boolean; labels?: Record<string, string> } = {},
  ): this {
    for (const family of families) {
      if (family.type === "gauge" && !gauges) continue;
      const seen = this.#order.get(family.name);
      if (seen && seen !== family.type) continue;
      this.#order.set(family.name, family.type);
      if (family.type === "histogram") this.#addHistogram(family, labels);
      else this.#addScalar(family, labels);
    }
    return this;
  }

  families(): AkanMetricFamily[] {
    return [...this.#order.keys()].flatMap((name): AkanMetricFamily[] => {
      const scalar = this.#scalars.get(name);
      if (scalar) return [{ ...scalar.family, samples: [...scalar.samples.values()] }];
      const histogram = this.#histograms.get(name);
      return histogram ? [{ ...histogram.family, samples: [...histogram.samples.values()] }] : [];
    });
  }

  #addScalar(family: ScalarFamily, constLabels: Record<string, string>) {
    let merged = this.#scalars.get(family.name);
    if (!merged) {
      merged = { family, samples: new Map() };
      this.#scalars.set(family.name, merged);
    }
    for (const sample of family.samples) {
      const labels = { ...constLabels, ...sample.labels };
      const key = keyOf(labels);
      const existing = merged.samples.get(key);
      if (existing) existing.value += sample.value;
      else merged.samples.set(key, { labels, value: sample.value });
    }
  }

  //? Buckets that differ from the first family seen (a replica of another release) cannot add up, so they are left out.
  #addHistogram(family: HistogramFamily, constLabels: Record<string, string>) {
    let merged = this.#histograms.get(family.name);
    if (!merged) {
      merged = { family, samples: new Map() };
      this.#histograms.set(family.name, merged);
    }
    if (merged.family.buckets.join() !== family.buckets.join()) return;
    for (const sample of family.samples) {
      const labels = { ...constLabels, ...sample.labels };
      const key = keyOf(labels);
      const existing = merged.samples.get(key);
      if (!existing) {
        merged.samples.set(key, {
          labels,
          counts: [...sample.counts],
          sum: sample.sum,
          count: sample.count,
        });
        continue;
      }
      for (let idx = 0; idx < existing.counts.length; idx++) existing.counts[idx] += sample.counts[idx] ?? 0;
      existing.sum += sample.sum;
      existing.count += sample.count;
    }
  }
}

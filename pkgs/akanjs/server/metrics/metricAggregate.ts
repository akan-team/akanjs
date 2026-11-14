import type { AkanMetricFamily, AkanMetricsReport } from "akanjs/service";
import { MetricMerge } from "./metricMerge";

interface ReplicaFamilies {
  instance: string;
  families: AkanMetricFamily[];
}

//? A replica that restarts counts from zero again. Its last counts move to a retired total, so the sum the gateway
//? reports never drops, which Prometheus would read as a counter reset of the whole series.
export class MetricAggregate {
  readonly #replicas = new Map<number, ReplicaFamilies>();
  #retired: AkanMetricFamily[] = [];

  update(idx: number, report: AkanMetricsReport) {
    if (!report.metricFamilies) return;
    const instance = `${report.pid ?? ""}:${report.startedAt ?? ""}`;
    const previous = this.#replicas.get(idx);
    if (previous && previous.instance !== instance)
      this.#retired = new MetricMerge().add(this.#retired).add(previous.families, { gauges: false }).families();
    this.#replicas.set(idx, { instance, families: report.metricFamilies });
  }

  families(): AkanMetricFamily[] {
    const merge = new MetricMerge().add(this.#retired);
    for (const { families } of this.#replicas.values()) merge.add(families);
    return merge.families();
  }
}

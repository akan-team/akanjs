import type { AkanMetricFamily, AkanMetricsReport, AkanRscWorkerStatus } from "akanjs/service";
import { AppInfo } from "../ops/appInfo";

type ScalarType = "counter" | "gauge";
type Labels = Record<string, string>;

const RSC_SERIES: readonly (readonly [keyof AkanMetricsReport, string, ScalarType, string])[] = [
  [
    "rscWorkerRestartCount",
    "akan_rsc_worker_restarts_total",
    "counter",
    "RSC worker restarts after it exited or hung.",
  ],
  ["rscWorkerRecycleCount", "akan_rsc_worker_recycles_total", "counter", "RSC workers replaced to give memory back."],
  ["rscPendingRenderCount", "akan_rsc_renders_pending", "gauge", "Renders the RSC worker has not answered yet."],
  ["rscQueuedSendCount", "akan_rsc_sends_queued", "gauge", "Messages waiting to reach the RSC worker."],
  ["rscWorkerRssBytes", "akan_rsc_worker_resident_memory_bytes", "gauge", "Resident memory of the RSC worker."],
];

const scalar = (type: ScalarType, name: string, help: string, value: number, labels: Labels = {}) =>
  ({ name, help, type, samples: [{ labels, value }] }) satisfies AkanMetricFamily;

export class RuntimeFamilies {
  static #buildLabels: Labels | null = null;

  static process(): AkanMetricFamily[] {
    RuntimeFamilies.#buildLabels ??= {
      akanjs_version: AppInfo.build().akanVersion ?? "unknown",
      //? Not `getEnv()`, which throws without the public env a gateway may be started without; a scrape still answers.
      app: process.env.AKAN_PUBLIC_APP_NAME ?? "unknown",
    };
    return [
      scalar("gauge", "akan_build_info", "The akanjs release and app this process runs, as labels.", 1, {
        ...RuntimeFamilies.#buildLabels,
      }),
      scalar(
        "gauge",
        "process_start_time_seconds",
        "When this process started, in seconds since the epoch; a new value means its counters started again from zero.",
        AppInfo.startedAt.getTime() / 1000,
      ),
    ];
  }

  static rscWorker(report: AkanMetricsReport | undefined, labels: Labels): AkanMetricFamily[] {
    if (!report) return [];
    return RSC_SERIES.flatMap(([key, name, type, help]) => {
      const value = report[key];
      return typeof value === "number" ? [scalar(type, name, help, value, labels)] : [];
    });
  }

  //? A replica of an earlier release reports no worker status; the gateway sends it renders, so it counts as ready.
  static rscReadiness(statuses: readonly (AkanRscWorkerStatus | undefined)[]): AkanMetricFamily[] {
    const workers = statuses.filter((status) => status !== null);
    const ready = workers.filter((status) => (status ?? "ready") === "ready").length;
    return [
      scalar("gauge", "akan_rsc_workers", "RSC workers this app runs to render pages.", workers.length),
      scalar("gauge", "akan_rsc_workers_ready", "RSC workers ready to render.", ready),
    ];
  }
}

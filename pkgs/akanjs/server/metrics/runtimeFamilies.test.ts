import { describe, expect, test } from "bun:test";
import { RuntimeFamilies } from "./runtimeFamilies";

const valuesOf = (families: ReturnType<typeof RuntimeFamilies.rscWorker>) =>
  Object.fromEntries(
    families.map((family) => [
      `${family.type} ${family.name}`,
      "value" in family.samples[0] ? family.samples[0].value : null,
    ]),
  );

describe("RuntimeFamilies", () => {
  test("reports the RSC worker's restarts, queue and memory from its sample, and nothing it left out", () => {
    const families = RuntimeFamilies.rscWorker(
      { rscWorkerStatus: "ready", rscWorkerRestartCount: 2, rscPendingRenderCount: 5, rscWorkerRssBytes: 1_024 },
      { role: "all" },
    );
    expect(valuesOf(families)).toEqual({
      "counter akan_rsc_worker_restarts_total": 2,
      "gauge akan_rsc_renders_pending": 5,
      "gauge akan_rsc_worker_resident_memory_bytes": 1_024,
    });
    expect(families.every((family) => family.samples[0]?.labels.role === "all")).toBe(true);
    expect(RuntimeFamilies.rscWorker(undefined, {})).toEqual([]);
  });

  test("counts the workers that render and those ready to, leaving out a process that renders no pages", () => {
    expect(valuesOf(RuntimeFamilies.rscReadiness(["ready", "restarting", null, undefined]))).toEqual({
      "gauge akan_rsc_workers": 3,
      "gauge akan_rsc_workers_ready": 2,
    });
  });
});

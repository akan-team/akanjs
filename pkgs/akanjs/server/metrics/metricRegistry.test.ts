import { describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import {
  LATENCY_BUCKETS_SECONDS,
  LabelValues,
  MAX_LABEL_VALUES,
  MetricRegistry,
  metricRegistry,
  OVERFLOW_LABEL_VALUE,
} from "./metricRegistry";

const codeOf = (register: () => unknown) => {
  try {
    register();
  } catch (error) {
    return AkanError.is(error) ? error.code : "not an AkanError";
  }
  return "registered";
};

describe("MetricRegistry", () => {
  test("adds a counter, a gauge or a histogram in one line and reports each as a family", () => {
    const registry = new MetricRegistry();
    registry.counter("akan_test_jobs_total", "Jobs run.", ["kind"]).inc({ kind: "mail" }, 2);
    registry.gauge("akan_test_queue_depth", "Jobs waiting.").set(7);
    registry.histogram("akan_test_wait_seconds", "Time a job waited.").observe(0.02);

    expect(registry.snapshot({ role: "all" })).toEqual([
      {
        name: "akan_test_jobs_total",
        help: "Jobs run.",
        type: "counter",
        samples: [{ labels: { role: "all", kind: "mail" }, value: 2 }],
      },
      {
        name: "akan_test_queue_depth",
        help: "Jobs waiting.",
        type: "gauge",
        samples: [{ labels: { role: "all" }, value: 7 }],
      },
      {
        name: "akan_test_wait_seconds",
        help: "Time a job waited.",
        type: "histogram",
        buckets: [...LATENCY_BUCKETS_SECONDS],
        samples: [{ labels: { role: "all" }, counts: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], sum: 0.02, count: 1 }],
      },
    ]);
  });

  test("hands back the metric already registered under a name, as a second copy of a module asks for it", () => {
    const registry = new MetricRegistry();
    const first = registry.counter("akan_test_calls_total", "Calls.", ["kind"]);
    expect(registry.counter("akan_test_calls_total", "Calls.", ["kind"])).toBe(first);
    expect(metricRegistry).toBe((process as unknown as { __akanMetricRegistry: MetricRegistry }).__akanMetricRegistry);
  });

  test("refuses a metric it could not expose as invalidMetric", () => {
    const registry = new MetricRegistry();
    registry.counter("akan_test_taken_total", "Taken.", ["kind"]);
    expect(codeOf(() => registry.counter("akan_test_calls", "No suffix."))).toBe("invalidMetric");
    expect(codeOf(() => registry.gauge("akan-test-depth", "A dash."))).toBe("invalidMetric");
    expect(codeOf(() => registry.gauge("akan_test_taken_total", "Another type."))).toBe("invalidMetric");
    expect(codeOf(() => registry.counter("akan_test_taken_total", "Other labels.", ["other"]))).toBe("invalidMetric");
    expect(codeOf(() => registry.histogram("akan_test_le_seconds", "Bucket label.", ["le"]))).toBe("invalidMetric");
    expect(codeOf(() => registry.gauge("akan_test_role", "Stamped label.", ["role"]))).toBe("invalidMetric");
    expect(codeOf(() => registry.histogram("akan_test_flat_seconds", "Flat.", [], [1, 1]))).toBe("invalidMetric");
  });

  test("counts a value on a bucket's bound in that bucket, and one past every bound in the last", () => {
    const histogram = new MetricRegistry().histogram("akan_test_bound_seconds", "Bounds.", [], [0.1, 1]);
    for (const value of [0.1, 0.5, 1, 30]) histogram.observe(value);
    const [sample] = histogram.snapshot({}).samples;
    expect(sample).toMatchObject({ labels: {}, counts: [1, 2, 1], count: 4 });
    expect(sample && "sum" in sample ? sample.sum : 0).toBeCloseTo(31.6);
  });

  test("folds every label value past the limit into one overflow series", () => {
    const counter = new MetricRegistry().counter("akan_test_paths_total", "Paths.", ["path"]);
    for (let idx = 0; idx < MAX_LABEL_VALUES + 5; idx++) counter.inc({ path: `/item/${idx}` });
    const samples = counter.snapshot({}).samples;
    expect(samples.length).toBe(MAX_LABEL_VALUES + 1);
    expect(samples.find(({ labels }) => labels.path === OVERFLOW_LABEL_VALUE)).toMatchObject({ value: 5 });

    const values = new LabelValues(2);
    expect(["a", "b", "c", "d", "a"].map((value) => values.admit(value))).toEqual([
      "a",
      "b",
      OVERFLOW_LABEL_VALUE,
      OVERFLOW_LABEL_VALUE,
      "a",
    ]);
  });
});

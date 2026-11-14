import { describe, expect, test } from "bun:test";
import { ProcessMetricsCollector } from "./processMetricsCollector";

describe("process metrics helpers", () => {
  test("parses positive memory log intervals and falls back otherwise", () => {
    expect(ProcessMetricsCollector.parseMemoryLogIntervalMs("1000")).toBe(1000);
    expect(ProcessMetricsCollector.parseMemoryLogIntervalMs("0")).toBe(60_000);
    expect(ProcessMetricsCollector.parseMemoryLogIntervalMs("not-a-number")).toBe(60_000);
  });

  test("leaves the JSC heap walk out of a default sample, and takes it only while memory is being diagnosed", async () => {
    const saved = { log: process.env.AKAN_MEMORY_LOG, gc: process.env.AKAN_MEMORY_GC_ON_REPORT };
    try {
      delete process.env.AKAN_MEMORY_LOG;
      delete process.env.AKAN_MEMORY_GC_ON_REPORT;
      const sampled = await ProcessMetricsCollector.collect();
      expect(sampled.heapUsedBytes).toBeGreaterThan(0);
      expect("jscHeapSizeBytes" in sampled || "jscObjectCount" in sampled).toBe(false);

      process.env.AKAN_MEMORY_LOG = "1";
      const diagnosed = await ProcessMetricsCollector.collect();
      expect(diagnosed.jscHeapSizeBytes).toBeGreaterThan(0);
      expect(diagnosed.jscObjectCount).toBeGreaterThan(0);
    } finally {
      for (const [key, value] of [
        ["AKAN_MEMORY_LOG", saved.log],
        ["AKAN_MEMORY_GC_ON_REPORT", saved.gc],
      ] as const)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
  });

  test("formats memory usage as stable one-line fields", () => {
    expect(ProcessMetricsCollector.formatBytes(1024 * 1024)).toBe("1.0MiB");
    expect(
      ProcessMetricsCollector.format({
        pid: 123,
        rssBytes: 2 * 1024 * 1024,
        heapUsedBytes: 3 * 1024 * 1024,
        heapTotalBytes: 4 * 1024 * 1024,
        externalBytes: 5 * 1024 * 1024,
        arrayBuffersBytes: 6 * 1024 * 1024,
      }),
    ).toBe("pid=123 rss=2.0MiB heapUsed=3.0MiB heapTotal=4.0MiB external=5.0MiB arrayBuffers=6.0MiB");
  });
});

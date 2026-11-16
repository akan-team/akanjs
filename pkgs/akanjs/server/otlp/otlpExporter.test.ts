import { describe, expect, test } from "bun:test";
import { Logger } from "akanjs/common";
import { RequestTrace } from "../../signal/requestTrace";
import { getCurrentTrace } from "../../signal/trace";
import type { Fetch } from "./otlpBatcher";
import { type OtlpConfig, OtlpConfigReader } from "./otlpConfig";
import { OtlpExporter } from "./otlpExporter";

const env = {
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.test:4318",
  OTEL_LOGS_EXPORTER: "otlp",
  OTEL_TRACES_SAMPLER: "always_on",
  OTEL_BLRP_MAX_EXPORT_BATCH_SIZE: "1",
};

const configOf = (overrides: Record<string, string> = {}): OtlpConfig => {
  const config = new OtlpConfigReader({ ...env, ...overrides }, () => undefined).read("federation");
  if (!config) throw new TypeError("the test env names no exporter");
  return config;
};

const until = async (check: () => boolean, ms = 2_000) => {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await Bun.sleep(5);
};

interface Call {
  url: string;
  body: string;
  inRequest: boolean;
}

describe("the OTLP exporter", () => {
  test("a failing collector's warnings and the exporter's own requests never enter its queues", async () => {
    const calls: Call[] = [];
    const fetchImpl: Fetch = async (url, init) => {
      calls.push({ url, body: String(init.body), inRequest: !!RequestTrace.current() || !!getCurrentTrace() });
      return new Response("no", { status: 400 });
    };
    const exporter = new OtlpExporter(configOf(), fetchImpl);
    try {
      const request = RequestTrace.fresh();
      RequestTrace.run(request, () => new Logger("Shop").warn("order placed"));
      await until(() => exporter.logs?.stats.failedBatches === 1);
      await Bun.sleep(50);

      expect(request.sampled).toBe(true);
      expect(calls.map((call) => [call.url, call.inRequest])).toEqual([["http://collector.test:4318/v1/logs", false]]);
      expect(calls[0]?.body).toContain("order placed");
      expect(calls[0]?.body).not.toContain("OTLP");
      expect(exporter.logs?.stats).toEqual({ queued: 0, exported: 0, dropped: 1, failedBatches: 1 });
      expect(exporter.spans?.stats).toEqual({ queued: 0, exported: 0, dropped: 0, failedBatches: 0 });
    } finally {
      await exporter.stop(10);
    }
  });

  test("shutdown holds to the budget it is given, not the default one", async () => {
    const exporter = new OtlpExporter(configOf(), () => new Promise<Response>(() => undefined));
    const slot = process as unknown as { __akanOtlpExporter?: OtlpExporter };
    slot.__akanOtlpExporter = exporter;
    new Logger("Shop").warn("order placed");
    const startedAt = performance.now();
    await OtlpExporter.shutdown(50);

    expect(performance.now() - startedAt).toBeLessThan(OtlpExporter.shutdownBudgetMs / 2);
    expect(exporter.logs?.stats.dropped).toBe(1);
  });

  test("an install after a stop builds a new exporter rather than handing back the stopped one", async () => {
    const first = OtlpExporter.install({ ...env, OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:9" });
    await OtlpExporter.shutdown(10);

    expect(first).not.toBeNull();
    expect(OtlpExporter.current).toBeNull();
    const second = OtlpExporter.install({ ...env, OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:9" });
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    await second?.stop(10);
  });
});

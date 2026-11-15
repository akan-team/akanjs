import { describe, expect, test } from "bun:test";
import { TraceContext } from "../../common/TraceContext";
import { OtlpSampler } from "./otlpSampler";

const withRandomness = (last14: string) => `${"a".repeat(18)}${last14}`;
const lowest = withRandomness("00000000000000");
const middle = withRandomness("80000000000000");
const highest = withRandomness("ffffffffffffff");

const sampled = (sampler: OtlpSampler, ids: string[], parent: boolean | null = null) =>
  ids.map((id) => sampler.sample(id, parent));

describe("OTLP head sampler", () => {
  test("always_on and always_off decide alone; their parentbased_ forms follow a parent's flag", () => {
    const ids = [lowest, middle, highest];

    expect(sampled(new OtlpSampler("always_on"), ids, false)).toEqual([true, true, true]);
    expect(sampled(new OtlpSampler("always_off"), ids, true)).toEqual([false, false, false]);
    expect(sampled(new OtlpSampler("parentbased_always_on"), ids, false)).toEqual([false, false, false]);
    expect(sampled(new OtlpSampler("parentbased_always_off"), ids, true)).toEqual([true, true, true]);
    expect(sampled(new OtlpSampler("parentbased_always_off"), ids)).toEqual([false, false, false]);
  });

  test("traceidratio samples a trace id whose last 56 bits reach (1 - ratio)·2^56, the same answer in every process", () => {
    const half = new OtlpSampler("traceidratio", 0.5);

    expect(sampled(half, [lowest, withRandomness("7fffffffffffff"), middle, highest])).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(sampled(new OtlpSampler("traceidratio", 0), [highest])).toEqual([false]);
    expect(sampled(new OtlpSampler("traceidratio", 1), [lowest])).toEqual([true]);
    expect(sampled(new OtlpSampler("parentbased_traceidratio", 0), [highest], true)).toEqual([true]);
  });

  test("a 0.01 ratio samples about one trace in a hundred", () => {
    const ratio = new OtlpSampler("traceidratio", 0.01);
    let count = 0;
    for (let i = 0; i < 20_000; i++) if (ratio.sample(TraceContext.mintTraceId(), null)) count += 1;

    expect(count).toBeGreaterThan(120);
    expect(count).toBeLessThan(280);
  });

  test("OTEL_TRACES_SAMPLER defaults to parentbased_always_on and takes OTEL_TRACES_SAMPLER_ARG for a ratio", () => {
    const warnings: string[] = [];
    const warn = (message: string) => void warnings.push(message);

    expect(OtlpSampler.fromEnv({}, warn)?.name).toBe("parentbased_always_on");
    expect(
      OtlpSampler.fromEnv({ OTEL_TRACES_SAMPLER: "TraceIdRatio", OTEL_TRACES_SAMPLER_ARG: "0" }, warn)?.sample(
        highest,
        null,
      ),
    ).toBe(false);
    expect(warnings).toEqual([]);
  });

  test("an unsupported sampler is reported once and samples nothing, and a bad ratio falls back to 1.0", () => {
    const warnings: string[] = [];
    const warn = (message: string) => void warnings.push(message);
    const jaeger = OtlpSampler.fromEnv({ OTEL_TRACES_SAMPLER: "parentbased_jaeger_remote" }, warn);
    const bad = OtlpSampler.fromEnv({ OTEL_TRACES_SAMPLER: "traceidratio", OTEL_TRACES_SAMPLER_ARG: "2" }, warn);

    expect(jaeger).toBeNull();
    expect(bad?.sample(lowest, null)).toBe(true);
    expect(warnings).toEqual([
      "OTEL_TRACES_SAMPLER=parentbased_jaeger_remote is not supported; no spans are exported",
      "OTEL_TRACES_SAMPLER_ARG is not a number from 0 to 1; using 1.0",
    ]);
    expect(new OtlpSampler("always_off").neverSamples).toBe(true);
    expect(new OtlpSampler("parentbased_always_off").neverSamples).toBe(false);
  });
});

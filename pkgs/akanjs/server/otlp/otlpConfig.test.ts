import { describe, expect, test } from "bun:test";
import { OtlpConfigReader } from "./otlpConfig";

const read = (env: Record<string, string>, role: string | null = "federation") => {
  const warnings: string[] = [];
  const config = new OtlpConfigReader(env, (message) => void warnings.push(message)).read(role);
  return { config, warnings };
};

const base = { OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" };

describe("OTLP exporter settings", () => {
  test("with no endpoint, or with OTEL_SDK_DISABLED=true, there is no exporter at all", () => {
    expect(read({}).config).toBeNull();
    expect(read({ OTEL_SERVICE_NAME: "shop", OTEL_TRACES_SAMPLER: "always_on" }).config).toBeNull();
    expect(read({ ...base, OTEL_SDK_DISABLED: "TRUE" }).config).toBeNull();
    expect(read({ ...base, OTEL_SDK_DISABLED: "false" }).config).not.toBeNull();
  });

  test("the generic endpoint is a base for v1/traces and v1/logs, and exports both; a per-signal one is used as is", () => {
    const generic = read({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318/otlp/" }).config;
    const specific = read({ ...base, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://traces.example.com/ingest" }).config;
    const tracesOnly = read({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://collector:4318/v1/traces" }).config;

    expect([generic?.traces?.url, generic?.logs?.url]).toEqual([
      "http://collector:4318/otlp/v1/traces",
      "http://collector:4318/otlp/v1/logs",
    ]);
    expect([specific?.traces?.url, specific?.logs?.url]).toEqual([
      "https://traces.example.com/ingest",
      "http://collector:4318/v1/logs",
    ]);
    expect([tracesOnly?.traces?.url, tracesOnly?.logs]).toEqual(["http://collector:4318/v1/traces", null]);
  });

  test("OTEL_LOGS_EXPORTER=none or OTEL_TRACES_EXPORTER=none turns one signal off", () => {
    expect(read({ ...base, OTEL_LOGS_EXPORTER: "none" }).config?.logs).toBeNull();
    expect(read({ ...base, OTEL_TRACES_EXPORTER: "none" }).config?.traces).toBeNull();
    expect(read({ ...base, OTEL_TRACES_EXPORTER: "none", OTEL_LOGS_EXPORTER: "none" }).config).toBeNull();
    const console = read({ ...base, OTEL_LOGS_EXPORTER: "console" });
    expect([console.config?.logs, console.warnings]).toEqual([
      null,
      ["OTEL_LOGS_EXPORTER names no otlp exporter; no logs are exported"],
    ]);
  });

  test("headers come from OTEL_EXPORTER_OTLP_HEADERS, percent-decoded, a per-signal list overriding a name", () => {
    const { config, warnings } = read({
      ...base,
      OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Basic%20c2VjcmV0, x-tenant = one",
      OTEL_EXPORTER_OTLP_LOGS_HEADERS: "x-tenant=two",
    });

    expect(config?.traces?.headers).toEqual({ authorization: "Basic c2VjcmV0", "x-tenant": "one" });
    expect(config?.logs?.headers).toEqual({ authorization: "Basic c2VjcmV0", "x-tenant": "two" });
    expect(warnings).toEqual([]);
  });

  test("a malformed header list is ignored with a warning that never quotes it", () => {
    const secret = "sk_live_do_not_print";
    const { config, warnings } = read({ ...base, OTEL_EXPORTER_OTLP_HEADERS: `api-key ${secret}` });
    const badUrl = read({ OTEL_EXPORTER_OTLP_ENDPOINT: `collector:4318?token=${secret}` });

    expect(config?.traces?.headers).toEqual({});
    expect(badUrl.config).toBeNull();
    expect([...warnings, ...badUrl.warnings].join("\n")).not.toContain(secret);
    expect(warnings).toEqual(["OTEL_EXPORTER_OTLP_HEADERS is not a list of name=value pairs; it is ignored"]);
  });

  test("gRPC is refused, http/protobuf is sent as JSON with a warning, and the timeout and batch settings are read", () => {
    const grpc = read({ ...base, OTEL_EXPORTER_OTLP_PROTOCOL: "grpc" });
    const protobuf = read({ ...base, OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "http/protobuf", OTEL_LOGS_EXPORTER: "none" });
    const tuned = read({
      ...base,
      OTEL_EXPORTER_OTLP_TIMEOUT: "2500",
      OTEL_EXPORTER_OTLP_LOGS_TIMEOUT: "800",
      OTEL_BSP_SCHEDULE_DELAY: "200",
      OTEL_BSP_MAX_QUEUE_SIZE: "100",
      OTEL_BSP_MAX_EXPORT_BATCH_SIZE: "500",
      OTEL_BLRP_SCHEDULE_DELAY: "x",
    });

    expect(grpc.config).toBeNull();
    expect(protobuf.config?.traces?.url).toBe("http://collector:4318/v1/traces");
    expect(protobuf.warnings).toEqual([
      "OTLP traces are sent as http/json, not http/protobuf; the collector must accept JSON",
    ]);
    expect(tuned.config?.traces).toMatchObject({ timeoutMs: 2500, delayMs: 200, maxQueue: 100, maxBatch: 100 });
    expect(tuned.config?.logs).toMatchObject({ timeoutMs: 800, delayMs: 1000, maxQueue: 2048, maxBatch: 512 });
    expect(tuned.warnings).toEqual(["OTEL_BLRP_SCHEDULE_DELAY is not a positive number; it is ignored"]);
    expect(read(base).config?.traces).toMatchObject({
      timeoutMs: 10_000,
      delayMs: 5000,
      maxQueue: 2048,
      maxBatch: 512,
    });
  });

  test("an always_off or unsupported sampler leaves traces off and logs on", () => {
    for (const sampler of ["always_off", "xray"]) {
      const { config } = read({ ...base, OTEL_TRACES_SAMPLER: sampler });
      expect([config?.traces, config?.sampler, config?.logs?.url]).toEqual([
        null,
        null,
        "http://collector:4318/v1/logs",
      ]);
    }
  });

  test("the resource names the service and the process role, OTEL_SERVICE_NAME over OTEL_RESOURCE_ATTRIBUTES", () => {
    const named = read(
      {
        ...base,
        OTEL_SERVICE_NAME: "shop",
        OTEL_RESOURCE_ATTRIBUTES: "service.name=ignored,deployment.environment.name=prod%2Ceu,team=web",
        AKAN_REPLICA_IDX: "1",
        AKAN_BUILD_ID: "b42",
      },
      "rsc-worker",
    ).config?.resource;
    const fallback = read({ ...base, AKAN_PUBLIC_APP_NAME: "minimal" }, null).config?.resource;
    const broken = read({ ...base, OTEL_RESOURCE_ATTRIBUTES: "team=web,%zz=1" });

    expect(named).toMatchObject({
      "service.name": "shop",
      "service.version": "b42",
      "deployment.environment.name": "prod,eu",
      team: "web",
      "telemetry.sdk.name": "akanjs",
      "process.pid": process.pid,
      "akan.process.role": "rsc-worker",
      "akan.replica.index": 1,
    });
    expect(fallback?.["service.name"]).toBe("minimal");
    expect(fallback?.["akan.process.role"]).toBeUndefined();
    expect(read(base).config?.resource["service.name"]).toBe("unknown_service:bun");
    expect(broken.config?.resource.team).toBeUndefined();
    expect(broken.warnings).toEqual(["OTEL_RESOURCE_ATTRIBUTES is not a list of key=value pairs; it is ignored"]);
  });
});

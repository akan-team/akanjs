import { hostname } from "node:os";
import type { ExportAttrs } from "../../signal/spanExport";
import { OtlpSampler } from "./otlpSampler";

type Env = Record<string, string | undefined>;
export type OtlpSignal = "traces" | "logs";

export interface OtlpSignalConfig {
  signal: OtlpSignal;
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxQueue: number;
  maxBatch: number;
  delayMs: number;
}

export interface OtlpConfig {
  traces: OtlpSignalConfig | null;
  logs: OtlpSignalConfig | null;
  sampler: OtlpSampler | null;
  resource: ExportAttrs;
}

const defaultTimeoutMs = 10_000;
// OTel's batch span (BSP) and batch log record (BLRP) processor settings, with their defaults.
const batchSettings = {
  traces: { prefix: "OTEL_BSP", maxQueue: 2048, maxBatch: 512, delayMs: 5_000 },
  logs: { prefix: "OTEL_BLRP", maxQueue: 2048, maxBatch: 512, delayMs: 1_000 },
} as const;
const headerName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const value = (env: Env, key: string): string | undefined => env[key]?.trim() || undefined;

//? Values are percent-encoded `key=value` pairs; `OTEL_RESOURCE_ATTRIBUTES` and the headers share the format.
const parsePairs = (text: string): [string, string][] | null => {
  const pairs: [string, string][] = [];
  for (const entry of text.split(",")) {
    if (!entry.trim()) continue;
    const at = entry.indexOf("=");
    if (at <= 0) return null;
    try {
      const key = decodeURIComponent(entry.slice(0, at).trim());
      if (!key) return null;
      pairs.push([key, decodeURIComponent(entry.slice(at + 1).trim())]);
    } catch {
      return null;
    }
  }
  return pairs;
};

export class OtlpConfigReader {
  readonly #env: Env;
  readonly #warn: (message: string) => void;
  readonly #headerLists = new Map<string, Record<string, string>>();

  constructor(env: Env, warn: (message: string) => void) {
    this.#env = env;
    this.#warn = warn;
  }

  //? No endpoint means no exporter: the OTel SDK default of localhost:4318 would make every app export by default.
  read(role: string | null): OtlpConfig | null {
    if (value(this.#env, "OTEL_SDK_DISABLED")?.toLowerCase() === "true") return null;
    const spans = this.#signal("traces");
    const sampler = spans ? OtlpSampler.fromEnv(this.#env, this.#warn) : null;
    const traces = sampler && !sampler.neverSamples ? spans : null;
    const logs = this.#signal("logs");
    if (!traces && !logs) return null;
    return { traces, logs, sampler: traces ? sampler : null, resource: this.#resource(role) };
  }

  #signal(signal: OtlpSignal): OtlpSignalConfig | null {
    const upper = signal.toUpperCase();
    const named = value(this.#env, `OTEL_${upper}_EXPORTER`);
    //? Security: a log line's text is sent unredacted, so unlike OTel's default the generic endpoint alone sends no logs.
    if (signal === "logs" && !named && !value(this.#env, "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT")) return null;
    const url = this.#endpointOf(signal);
    if (!url) return null;
    const exporters = (named ?? "otlp").toLowerCase().split(",");
    const names = exporters.map((name) => name.trim()).filter(Boolean);
    if (names.includes("none")) return null;
    if (!names.includes("otlp")) {
      this.#warn(`OTEL_${upper}_EXPORTER names no otlp exporter; no ${signal} are exported`);
      return null;
    }
    const protocol =
      value(this.#env, `OTEL_EXPORTER_OTLP_${upper}_PROTOCOL`) ?? value(this.#env, "OTEL_EXPORTER_OTLP_PROTOCOL");
    if (protocol === "grpc") {
      this.#warn(`OTLP over gRPC is not supported; no ${signal} are exported, set the protocol to http/json`);
      return null;
    }
    if (protocol && protocol !== "http/json")
      this.#warn(`OTLP ${signal} are sent as http/json, not ${protocol}; the collector must accept JSON`);
    return {
      signal,
      url,
      headers: {
        ...this.#headers("OTEL_EXPORTER_OTLP_HEADERS"),
        ...this.#headers(`OTEL_EXPORTER_OTLP_${upper}_HEADERS`),
      },
      timeoutMs:
        this.#positive(`OTEL_EXPORTER_OTLP_${upper}_TIMEOUT`) ??
        this.#positive("OTEL_EXPORTER_OTLP_TIMEOUT") ??
        defaultTimeoutMs,
      ...this.#batch(signal),
    };
  }

  #batch(signal: OtlpSignal): Pick<OtlpSignalConfig, "maxQueue" | "maxBatch" | "delayMs"> {
    const { prefix, ...defaults } = batchSettings[signal];
    const maxQueue = Math.max(1, Math.floor(this.#positive(`${prefix}_MAX_QUEUE_SIZE`) ?? defaults.maxQueue));
    const maxBatch = Math.max(1, Math.floor(this.#positive(`${prefix}_MAX_EXPORT_BATCH_SIZE`) ?? defaults.maxBatch));
    const delayMs = this.#positive(`${prefix}_SCHEDULE_DELAY`) ?? defaults.delayMs;
    return { maxQueue, maxBatch: Math.min(maxQueue, maxBatch), delayMs };
  }

  //? A per-signal endpoint is the full URL; the generic one is a base that `v1/<signal>` is appended to.
  #endpointOf(signal: OtlpSignal): string | null {
    const upper = signal.toUpperCase();
    const specific = value(this.#env, `OTEL_EXPORTER_OTLP_${upper}_ENDPOINT`);
    const base = value(this.#env, "OTEL_EXPORTER_OTLP_ENDPOINT");
    const raw = specific ?? (base ? `${base.replace(/\/+$/, "")}/v1/${signal}` : null);
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch {
      // Reported below without the value, which may carry a credential.
    }
    this.#warn(`the OTLP ${signal} endpoint is not an http(s) URL; no ${signal} are exported`);
    return null;
  }

  //? Security: a header value is a collector credential, so a warning names the variable and never what it holds.
  #headers(key: string): Record<string, string> {
    const read = this.#headerLists.get(key) ?? this.#parseHeaders(key);
    this.#headerLists.set(key, read);
    return read;
  }

  #parseHeaders(key: string): Record<string, string> {
    const raw = value(this.#env, key);
    if (!raw) return {};
    const pairs = parsePairs(raw);
    if (!pairs || pairs.some(([name]) => !headerName.test(name))) {
      this.#warn(`${key} is not a list of name=value pairs; it is ignored`);
      return {};
    }
    return Object.fromEntries(pairs.map(([name, text]) => [name.toLowerCase(), text]));
  }

  #positive(key: string): number | null {
    const raw = value(this.#env, key);
    if (!raw) return null;
    const number = Number(raw);
    if (Number.isFinite(number) && number > 0) return number;
    this.#warn(`${key} is not a positive number; it is ignored`);
    return null;
  }

  #resource(role: string | null): ExportAttrs {
    const raw = value(this.#env, "OTEL_RESOURCE_ATTRIBUTES");
    const pairs = raw ? parsePairs(raw) : [];
    if (!pairs) this.#warn("OTEL_RESOURCE_ATTRIBUTES is not a list of key=value pairs; it is ignored");
    const fromEnv: ExportAttrs = Object.fromEntries(pairs ?? []);
    const named = fromEnv["service.name"];
    const replicaIdx = Number.parseInt(this.#env.AKAN_REPLICA_IDX ?? "", 10);
    const buildId = value(this.#env, "AKAN_BUILD_ID");
    const environment = value(this.#env, "AKAN_PUBLIC_ENV");
    return {
      "host.name": hostname(),
      ...(buildId ? { "service.version": buildId } : {}),
      ...(environment ? { "deployment.environment.name": environment } : {}),
      ...fromEnv,
      "service.name":
        value(this.#env, "OTEL_SERVICE_NAME") ??
        (named ? String(named) : undefined) ??
        value(this.#env, "AKAN_PUBLIC_APP_NAME") ??
        "unknown_service:bun",
      "telemetry.sdk.name": "akanjs",
      "process.pid": process.pid,
      "process.runtime.name": "bun",
      "process.runtime.version": Bun.version,
      ...(role ? { "akan.process.role": role } : {}),
      ...(Number.isInteger(replicaIdx) ? { "akan.replica.index": replicaIdx } : {}),
    };
  }
}

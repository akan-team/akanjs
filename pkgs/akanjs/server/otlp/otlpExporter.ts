import { Logger, type LoggerSinkEntry } from "akanjs/common";
import { RequestTrace } from "../../signal/requestTrace";
import { type ExportSpan, SpanExport, type SpanExportSink } from "../../signal/spanExport";
import { getCurrentTrace } from "../../signal/trace";
import { type Fetch, OtlpBatcher } from "./otlpBatcher";
import { type OtlpConfig, OtlpConfigReader } from "./otlpConfig";
import { OtlpEncode, type OtlpLogItem } from "./otlpEncode";

type Env = Record<string, string | undefined>;

const loggerName = "Otlp";
const shutdownBudgetMs = 1_500;

// Pinned to `process`: the worker's app bundle and the framework runtime may each load this module.
const slot = process as unknown as { __akanOtlpExporter?: OtlpExporter };

const spanOf = (traceId: string): { spanId: string; sampled: boolean } | null => {
  const trace = getCurrentTrace();
  if (trace?.traceId === traceId) return { spanId: trace.spanId, sampled: trace.sampled };
  const request = RequestTrace.current();
  return request?.traceId === traceId ? { spanId: request.spanId, sampled: request.sampled } : null;
};

export class OtlpExporter {
  readonly spans: OtlpBatcher<ExportSpan> | null;
  readonly logs: OtlpBatcher<OtlpLogItem> | null;
  readonly #sink: SpanExportSink | null = null;
  readonly #removeLogSink: (() => void) | null = null;
  #stopping: Promise<void> | null = null;

  constructor({ traces, logs, sampler, resource }: OtlpConfig, fetchImpl?: Fetch) {
    const logger = new Logger(loggerName);
    const spans =
      traces && sampler
        ? new OtlpBatcher(traces, (batch: ExportSpan[]) => OtlpEncode.traces(resource, batch), logger, fetchImpl)
        : null;
    this.spans = spans;
    this.logs = logs
      ? new OtlpBatcher(logs, (batch: OtlpLogItem[]) => OtlpEncode.logs(resource, batch), logger, fetchImpl)
      : null;
    if (spans && sampler) {
      this.#sink = {
        sample: (traceId, parentSampled) => sampler.sample(traceId, parentSampled),
        enqueue: (span) => spans.push(span),
      };
      SpanExport.install(this.#sink);
      spans.start();
    }
    if (this.logs) {
      //? Its own lines stay out, so a failing collector cannot feed the queue that is failing to drain.
      this.#removeLogSink = Logger.addSink((entry) => this.#ingest(entry), { minLevel: Logger.level });
      this.logs.start();
    }
  }

  static get current(): OtlpExporter | null {
    return slot.__akanOtlpExporter ?? null;
  }

  //? Read once the process knows its role; with no endpoint set nothing is created, so a request pays one branch.
  static install(env: Env = process.env): OtlpExporter | null {
    if (slot.__akanOtlpExporter) return slot.__akanOtlpExporter;
    const logger = new Logger(loggerName);
    const config = new OtlpConfigReader(env, (message) => logger.warn(message)).read(Logger.role);
    if (!config) return null;
    slot.__akanOtlpExporter = new OtlpExporter(config);
    const on = [
      config.traces && `traces to ${new URL(config.traces.url).host} (${config.sampler?.name})`,
      config.logs && `logs to ${new URL(config.logs.url).host}`,
    ];
    logger.info(`OTLP export on: ${on.filter(Boolean).join(", ")}`);
    return slot.__akanOtlpExporter;
  }

  static async shutdown(): Promise<void> {
    await slot.__akanOtlpExporter?.stop();
  }

  static exitAfterFlush(code: number): void {
    const exporter = slot.__akanOtlpExporter;
    if (!exporter) process.exit(code);
    void exporter.stop().finally(() => process.exit(code));
  }

  stop(budgetMs = shutdownBudgetMs): Promise<void> {
    this.#stopping ??= (async () => {
      if (this.#sink && SpanExport.sink === this.#sink) SpanExport.install(null);
      this.#removeLogSink?.();
      await Promise.all([this.spans?.shutdown(budgetMs), this.logs?.shutdown(budgetMs)]);
    })();
    return this.#stopping;
  }

  #ingest({ record }: LoggerSinkEntry): void {
    if (record.level === null || record.name === loggerName) return;
    const span = record.traceId ? spanOf(record.traceId) : null;
    this.logs?.push({ record, spanId: span?.spanId ?? null, sampled: span?.sampled ?? false });
  }
}

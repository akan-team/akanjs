import type { LogAttrValue, LogRecord } from "akanjs/common";
import type { ExportAttrs, ExportSpan } from "../../signal/spanExport";

export interface OtlpLogItem {
  record: LogRecord;
  spanId: string | null;
  sampled: boolean;
}

type AnyValue = { stringValue: string } | { boolValue: boolean } | { intValue: string } | { doubleValue: number };

// OTLP `StatusCode.STATUS_CODE_ERROR`; an unset status is left out.
const statusError = 2;
const scope = { name: "akanjs" };
const hexTraceId = /^[0-9a-f]{32}$/;

//? OTLP/JSON writes a 64-bit integer as a decimal string; JSON numbers lose digits past 2^53.
const anyValue = (value: string | number | boolean): AnyValue =>
  typeof value === "string"
    ? { stringValue: value }
    : typeof value === "boolean"
      ? { boolValue: value }
      : Number.isSafeInteger(value)
        ? { intValue: String(value) }
        : Number.isFinite(value)
          ? { doubleValue: value }
          : { stringValue: String(value) };

const keyValues = (attrs: Record<string, LogAttrValue | undefined>) => {
  const values: { key: string; value: AnyValue }[] = [];
  for (const [key, value] of Object.entries(attrs))
    if (value !== null && value !== undefined) values.push({ key, value: anyValue(value) });
  return values;
};

//? Nanoseconds since the epoch pass 2^53, so the whole milliseconds and the nanosecond remainder are joined as text.
export const unixNano = (epochMs: number): string => {
  const whole = Math.floor(epochMs);
  const nanos = Math.round((epochMs - whole) * 1e6);
  return nanos >= 1e6 ? `${whole + 1}000000` : `${whole}${String(nanos).padStart(6, "0")}`;
};

const resourceOf = (attrs: ExportAttrs) => ({ attributes: keyValues(attrs) });

export class OtlpEncode {
  static traces(resource: ExportAttrs, spans: ExportSpan[], epochOffsetMs = Date.now() - performance.now()): string {
    return JSON.stringify({
      resourceSpans: [
        {
          resource: resourceOf(resource),
          scopeSpans: [{ scope, spans: spans.map((span) => OtlpEncode.#span(span, epochOffsetMs)) }],
        },
      ],
    });
  }

  static logs(resource: ExportAttrs, items: OtlpLogItem[]): string {
    return JSON.stringify({
      resourceLogs: [
        { resource: resourceOf(resource), scopeLogs: [{ scope, logRecords: items.map(OtlpEncode.#log) }] },
      ],
    });
  }

  static #span(span: ExportSpan, epochOffsetMs: number) {
    const endTimeUnixNano = unixNano(epochOffsetMs + span.endMs);
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
      flags: 1,
      name: span.name,
      kind: span.kind,
      startTimeUnixNano: unixNano(epochOffsetMs + span.startMs),
      endTimeUnixNano,
      attributes: keyValues(span.link ? { ...span.attrs, "akan.trace.link": span.link } : span.attrs),
      ...(span.exception
        ? {
            events: [
              {
                timeUnixNano: endTimeUnixNano,
                name: "exception",
                attributes: keyValues({
                  "exception.type": span.exception.type,
                  "exception.message": span.exception.message,
                }),
              },
            ],
          }
        : {}),
      //? A link's SpanContext is valid only with a span id, so an id with none goes as the attribute above alone.
      ...(span.link && span.linkSpanId ? { links: [{ traceId: span.link, spanId: span.linkSpanId }] } : {}),
      ...(span.failed ? { status: { code: statusError } } : {}),
    };
  }

  static #log({ record, spanId, sampled }: OtlpLogItem) {
    const traceId = record.traceId && hexTraceId.test(record.traceId) ? record.traceId : null;
    const time = unixNano(record.at);
    return {
      timeUnixNano: time,
      observedTimeUnixNano: time,
      severityNumber: record.sev,
      severityText: (record.level ?? "info").toUpperCase(),
      body: { stringValue: record.message },
      attributes: keyValues({
        ...record.attrs,
        "akan.logger": record.name,
        "akan.context": record.context || undefined,
        "akan.endpoint": record.endpoint,
        "akan.origin": record.origin,
        "akan.trace.link": record.link,
      }),
      ...(traceId ? { traceId, ...(spanId ? { spanId } : {}), flags: sampled ? 1 : 0 } : {}),
    };
  }
}

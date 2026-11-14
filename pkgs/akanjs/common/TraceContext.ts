export interface TraceParent {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

export interface AdoptedTrace {
  traceId: string;
  parentSpanId: string | null;
  sampled: boolean;
  link: string | null;
}

type OutboundReader = () => string | undefined;

// Pinned to `process`: the worker evaluates the app bundle and the framework runtime as separate module realms.
const slot: { __akanTraceparentReader?: OutboundReader | null } =
  typeof process === "undefined" ? {} : (process as unknown as { __akanTraceparentReader?: OutboundReader | null });

const traceparentShape = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const hexIdShape = /^[0-9a-f]{32}$/;
const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const zeroTraceId = "0".repeat(32);
const zeroSpanId = "0".repeat(16);

const hexOf = (bytes: Uint8Array): string => {
  crypto.getRandomValues(bytes);
  const native = (bytes as Uint8Array & { toHex?: () => string }).toHex;
  if (native) return native.call(bytes);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
};

// W3C Trace Context ids: a 16-byte trace id and an 8-byte span id, lowercase hex, never all zero.
export class TraceContext {
  static readonly traceparentHeader = "traceparent";
  static readonly requestIdHeader = "x-request-id";
  static readonly linkHeader = "x-akan-trace-link";
  static readonly #traceBytes = new Uint8Array(16);
  static readonly #spanBytes = new Uint8Array(8);

  static mintTraceId(): string {
    return hexOf(TraceContext.#traceBytes);
  }

  static mintSpanId(): string {
    return hexOf(TraceContext.#spanBytes);
  }

  static traceparentOf(traceId: string, spanId: string, sampled = false): string {
    return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
  }

  //? Version `ff` is the one the spec forbids; a later version may append fields, which a 55-character read refuses.
  static parseTraceparent(value: string | null | undefined): TraceParent | null {
    if (value?.length !== 55 || !traceparentShape.test(value) || value.startsWith("ff")) return null;
    const traceId = value.slice(3, 35);
    const spanId = value.slice(36, 52);
    if (traceId === zeroTraceId || spanId === zeroSpanId) return null;
    return { traceId, spanId, sampled: (Number.parseInt(value.slice(53), 16) & 1) === 1 };
  }

  static parseId(value: string | null | undefined): string | null {
    if (!value || (value.length !== 32 && value.length !== 36)) return null;
    const lower = value.toLowerCase();
    const id = value.length === 36 ? (uuidShape.test(lower) ? lower.replaceAll("-", "") : null) : lower;
    return id && hexIdShape.test(id) && id !== zeroTraceId ? id : null;
  }

  // Security: the id names a request in logs, response headers and error bodies, so only a trusted hop chooses it.
  static adopt(headers: Headers, isTrustedPeer: () => boolean): AdoptedTrace {
    const traceparent = headers.get(TraceContext.traceparentHeader);
    const requestId = headers.get(TraceContext.requestIdHeader);
    if (traceparent === null && requestId === null) return TraceContext.#minted(null);
    const parent = TraceContext.parseTraceparent(traceparent);
    const inbound = parent?.traceId ?? TraceContext.parseId(requestId);
    if (!inbound) return TraceContext.#minted(null);
    if (!isTrustedPeer()) return TraceContext.#minted(inbound);
    return {
      traceId: inbound,
      parentSpanId: parent?.spanId ?? null,
      sampled: parent?.sampled ?? false,
      link: TraceContext.parseId(headers.get(TraceContext.linkHeader)),
    };
  }

  static #minted(link: string | null): AdoptedTrace {
    return { traceId: TraceContext.mintTraceId(), parentSpanId: null, sampled: false, link };
  }

  static registerOutboundReader(reader: OutboundReader | null) {
    slot.__akanTraceparentReader = reader;
  }

  static outbound(): string | undefined {
    return slot.__akanTraceparentReader?.();
  }
}

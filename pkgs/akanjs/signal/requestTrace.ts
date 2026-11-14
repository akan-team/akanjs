import { AsyncLocalStorage } from "node:async_hooks";
import type { LogContextSnapshot } from "akanjs/common";
import { type AdoptedTrace, TraceContext } from "../common/TraceContext";

export interface TraceParentRef {
  readonly traceId: string;
  readonly spanId: string;
  readonly sampled?: boolean;
  readonly link?: string | null;
}

// Pinned to `process` like the trace ALS: the app bundle and the framework runtime may each load this module.
const processStore = process as unknown as { __akanRequestTraceAls?: AsyncLocalStorage<RequestTrace> };
processStore.__akanRequestTraceAls ??= new AsyncLocalStorage<RequestTrace>();
const als = processStore.__akanRequestTraceAls;

export class RequestTrace implements TraceParentRef {
  readonly traceId: string;
  readonly parentSpanId: string | null;
  readonly sampled: boolean;
  readonly link: string | null;
  #spanId: string | null = null;
  #logContext: LogContextSnapshot | null = null;

  constructor({ traceId, parentSpanId, sampled, link }: AdoptedTrace) {
    this.traceId = traceId;
    this.parentSpanId = parentSpanId;
    this.sampled = sampled;
    this.link = link;
  }

  get spanId(): string {
    this.#spanId ??= TraceContext.mintSpanId();
    return this.#spanId;
  }

  get traceparent(): string {
    return TraceContext.traceparentOf(this.traceId, this.spanId, this.sampled);
  }

  get logContext(): LogContextSnapshot {
    this.#logContext ??= { traceId: this.traceId, endpoint: null, origin: "http" };
    return this.#logContext;
  }

  static adopt(headers: Headers, isTrustedPeer: () => boolean): RequestTrace {
    return new RequestTrace(TraceContext.adopt(headers, isTrustedPeer));
  }

  static fresh(): RequestTrace {
    return new RequestTrace({ traceId: TraceContext.mintTraceId(), parentSpanId: null, sampled: false, link: null });
  }

  //? Security: only for what a parent process sent over IPC, a channel no caller writes to; a header goes to `adopt`.
  static continued(traceparent: string | null | undefined, link?: string | null): RequestTrace | null {
    const parent = TraceContext.parseTraceparent(traceparent);
    if (!parent) return null;
    return new RequestTrace({
      traceId: parent.traceId,
      parentSpanId: parent.spanId,
      sampled: parent.sampled,
      link: TraceContext.parseId(link),
    });
  }

  static current(): RequestTrace | undefined {
    return als.getStore();
  }

  static run<T>(trace: RequestTrace, fn: () => T): T {
    return als.run(trace, fn);
  }

  static echo<R extends Response | undefined>(response: R, trace: RequestTrace): R {
    if (!response) return response;
    try {
      response.headers.set(TraceContext.requestIdHeader, trace.traceId);
      return response;
    } catch {
      // A fetched Response's headers are immutable; the copy streams the same body.
      const copy = new Response(response.body, response);
      copy.headers.set(TraceContext.requestIdHeader, trace.traceId);
      return copy as R;
    }
  }
}

import { readLogContext } from "akanjs/common";
import type { AkanJobOptions } from "akanjs/service";
import { TraceContext } from "../../common/TraceContext";
import { runTraced, SignalTrace } from "../../signal/trace";

export class JobTrace {
  static linked(options?: AkanJobOptions): AkanJobOptions | undefined {
    const traceLink = readLogContext()?.traceId;
    return traceLink ? { ...options, traceLink } : options;
  }

  //? A job runs after its request answered, often in another process: a trace of its own that links the enqueuing one.
  static async run<T>(key: string, job: unknown, fn: () => Promise<T>): Promise<T> {
    const trace = SignalTrace.create(key, "internal", "internal");
    const traceLink = (job as { opts?: AkanJobOptions } | null | undefined)?.opts?.traceLink;
    if (trace && traceLink) trace.link = TraceContext.parseId(traceLink);
    return await runTraced(trace, fn);
  }
}

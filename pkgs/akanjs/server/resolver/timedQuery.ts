import type { DocumentTouchOptions } from "akanjs/document";
import { StatementProbe } from "akanjs/service";
import { getCurrentTrace } from "akanjs/signal";
import "../metrics/statementMetrics";

//? Security: `op` names the store method, never a statement or a value: a span reaches metrics and response headers.
export const timedQuery = async <T>(model: string, op: string, fn: () => Promise<T>): Promise<T> => {
  const call = StatementProbe.call(model, op);
  const trace = getCurrentTrace();
  if (trace?.mode !== "full") return await StatementProbe.within(call, fn);
  const start = performance.now();
  try {
    return await StatementProbe.within(call, fn);
  } finally {
    //? The drivers record a span per statement; a store that reaches neither still shows one span per model call.
    if (!call.sent) trace.recordDbQuery(model, op, performance.now() - start);
  }
};
export const touchOf = (options?: DocumentTouchOptions) => (options?.touch === false ? { touch: false } : {});
export const touchArgs = (options?: DocumentTouchOptions): [] | [DocumentTouchOptions] =>
  options?.touch === false ? [{ touch: false }] : [];

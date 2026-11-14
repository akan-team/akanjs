import type { DocumentTouchOptions } from "akanjs/document";
import { getCurrentTrace } from "akanjs/signal";

//? Security: `op` names the store method, never a statement or a value: a span reaches metrics and response headers.
export const timedQuery = async <T>(model: string, op: string, fn: () => Promise<T>): Promise<T> => {
  const trace = getCurrentTrace();
  if (trace?.mode !== "full") return await fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    trace.recordDbQuery(model, op, performance.now() - start);
  }
};
export const touchOf = (options?: DocumentTouchOptions) => (options?.touch === false ? { touch: false } : {});
export const touchArgs = (options?: DocumentTouchOptions): [] | [DocumentTouchOptions] =>
  options?.touch === false ? [{ touch: false }] : [];

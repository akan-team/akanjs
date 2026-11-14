import type { DocumentTouchOptions } from "akanjs/document";
import { getCurrentTrace } from "akanjs/signal";

export const timedQuery = async <T>(fn: () => Promise<T>): Promise<T> => {
  const trace = getCurrentTrace();
  if (!trace) return await fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    trace.countDbQuery(performance.now() - start);
  }
};
export const touchOf = (options?: DocumentTouchOptions) => (options?.touch === false ? { touch: false } : {});
export const touchArgs = (options?: DocumentTouchOptions): [] | [DocumentTouchOptions] =>
  options?.touch === false ? [{ touch: false }] : [];

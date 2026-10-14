import type { AkanJobOptions } from "../ipcTypes";

// bullmq's own schedule, so a job retries at the same times whichever queue runs it; `maxDelay` caps its growth.
export class QueueBackoff {
  static delayOf(backoff: AkanJobOptions["backoff"], attemptsMade: number): number {
    if (!backoff) return 0;
    if (typeof backoff === "number") return backoff;
    const delay = Number(backoff.delay ?? 0);
    const grown = backoff.type === "exponential" ? Math.round(2 ** (attemptsMade - 1) * delay) : delay;
    const cap = Number(backoff.maxDelay);
    return backoff.maxDelay !== undefined && Number.isFinite(cap) ? Math.min(grown, cap) : grown;
  }
}

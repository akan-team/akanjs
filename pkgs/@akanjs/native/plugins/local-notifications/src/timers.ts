// In-process scheduling for hosts without an OS scheduler (web page, desktop Worker): timers that
// live as long as the page or the app. Pure TypeScript with an injectable clock, so it is unit tested.

import type { PendingNotification } from "./index.ts";
import { nextOccurrence, type ScheduledNotification } from "./schedule.ts";

/** setTimeout clamps delays above 2^31-1 ms (about 24.8 days) to 0: wait in steps instead. */
const MAX_DELAY = 2_147_483_647;

export interface TimerHost {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Shows the notification. Called for every delivery, repeats included. */
  show(notification: ScheduledNotification): void;
}

export const systemTimers = {
  now: () => Date.now(),
  setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimer: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class NotificationTimers {
  private readonly pending = new Map<number, { notification: ScheduledNotification; timer: unknown }>();

  constructor(private readonly host: TimerHost) {}

  /** Same id again replaces the earlier one. Due notifications are shown right away. */
  schedule(notifications: ScheduledNotification[]): number[] {
    for (const n of notifications) {
      this.cancel([n.id]);
      if (!n.every && n.at <= this.host.now()) this.host.show(n);
      else this.arm({ ...n });
    }
    return notifications.map((n) => n.id);
  }

  cancel(ids: number[]): void {
    for (const id of ids) {
      const entry = this.pending.get(id);
      if (!entry) continue;
      this.host.clearTimer(entry.timer);
      this.pending.delete(id);
    }
  }

  list(): PendingNotification[] {
    return [...this.pending.values()].map(({ notification }) => ({ ...notification })).sort((a, b) => a.at - b.at);
  }

  private arm(n: ScheduledNotification): void {
    const delay = Math.min(MAX_DELAY, Math.max(0, n.at - this.host.now()));
    const timer = this.host.setTimer(() => this.fire(n), delay);
    this.pending.set(n.id, { notification: n, timer });
  }

  private fire(n: ScheduledNotification): void {
    if (this.pending.get(n.id)?.notification !== n) return; // cancelled or replaced meanwhile
    const now = this.host.now();
    if (n.at > now) {
      this.arm(n); // a long wait in steps, or the clock moved back
      return;
    }
    this.host.show(n);
    if (!n.every) {
      this.pending.delete(n.id);
      return;
    }
    // After a sleep, skip the missed repeats instead of showing them all.
    this.arm({ ...n, at: nextOccurrence(n.at, n.every, now) });
  }
}

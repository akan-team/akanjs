// Argument checks and time arithmetic shared by every host. The page normalizes schedule() once
// (normalizeSchedule), so native code only sees epoch milliseconds and never parses dates: an ISO
// string without an offset is local time in JS, and Swift/Kotlin parsers disagree on such forms.

import { AkanNativeError } from "../../../packages/core/src/index.ts";
import type { NotificationData, Repeat } from "./index.ts";

export const REPEATS: readonly Repeat[] = ["minute", "hour", "day", "week"];

/** How much earlier than "one interval from now" a repeating series starts at the latest. */
export const REPEAT_MARGIN = 2000;

/** What schedule() sends to the host: `at` is always the first delivery time in epoch ms. */
export interface ScheduledNotification {
  id: number;
  title: string;
  body: string;
  at: number;
  every?: Repeat;
  channelId?: string;
  data?: NotificationData;
}

const invalid = (message: string) => new AkanNativeError("INVALID_ARGS", message);

export function isInt32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= -2147483648 && (value as number) <= 2147483647;
}

/** A list of notification ids (32-bit integers, the Android notification id range). */
export function checkIds(args: unknown, method: string): number[] {
  const ids = (args as { ids?: unknown } | null | undefined)?.ids;
  if (!Array.isArray(ids) || !ids.every(isInt32)) throw invalid(`${method}: ids must be an array of 32-bit integers`);
  return ids as number[];
}

/**
 * The same wall-clock time `count` intervals after `at`. day and week keep the local time of day
 * across DST changes (09:00 stays 09:00), like iOS calendar triggers; minute and hour are fixed lengths.
 */
export function addInterval(at: number, every: Repeat, count = 1): number {
  if (every === "minute") return at + count * 60_000;
  if (every === "hour") return at + count * 3_600_000;
  const d = new Date(at);
  const days = (every === "day" ? 1 : 7) * count;
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  ).getTime();
}

/** The first occurrence of the series (at, at + 1 interval, ...) that is later than `after`. */
export function nextOccurrence(at: number, every: Repeat, after: number): number {
  if (at > after) return at;
  const step = every === "minute" ? 60_000 : every === "hour" ? 3_600_000 : every === "day" ? 86_400_000 : 604_800_000;
  // Jump close with the nominal length (DST shifts day/week by at most an hour), then walk.
  let k = Math.max(1, Math.floor((after - at) / step));
  while (addInterval(at, every, k - 1) > after && k > 1) k--;
  while (addInterval(at, every, k) <= after) k++;
  return addInterval(at, every, k);
}

/** For hosts in JS (web, desktop): the arguments normalizeSchedule produced, checked again at the bridge. */
export function checkScheduled(args: unknown): ScheduledNotification[] {
  const list = (args as { notifications?: unknown } | null | undefined)?.notifications;
  const ok =
    Array.isArray(list) &&
    list.length > 0 &&
    list.every(
      (n) =>
        isPlainObject(n) &&
        isInt32(n.id) &&
        typeof n.title === "string" &&
        typeof n.body === "string" &&
        typeof n.at === "number" &&
        Number.isFinite(n.at) &&
        (n.every === undefined || REPEATS.includes(n.every as Repeat)) &&
        (n.data === undefined || isPlainObject(n.data)),
    );
  if (!ok) throw invalid("schedule: expected the notifications normalizeSchedule() produces");
  return list as ScheduledNotification[];
}

function parseAt(value: unknown, index: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  throw invalid(`notifications[${index}].at must be an ISO 8601 date-time string or epoch milliseconds`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Checks schedule() arguments and resolves the first delivery time of each notification:
 * - no at, no every: now (shown right away)
 * - at only: that time; a time in the past means now
 * - every only: one interval from now (2 s earlier, see REPEAT_MARGIN)
 * - at + every: at sets the phase (09:00 for a daily reminder) and must be less than one interval
 *   away, because an iOS repeating trigger cannot start later than its next matching time.
 *   A past at continues the series at its next occurrence.
 */
export function normalizeSchedule(args: unknown, now: number): { notifications: ScheduledNotification[] } {
  const list = (args as { notifications?: unknown } | null | undefined)?.notifications;
  if (!Array.isArray(list) || list.length === 0) throw invalid("schedule: notifications must be a non-empty array");
  const seen = new Set<number>();
  const notifications = list.map((raw, i): ScheduledNotification => {
    if (!isPlainObject(raw)) throw invalid(`notifications[${i}] must be an object`);
    const { id, title, body, at, every, channelId, data } = raw;
    if (!isInt32(id)) throw invalid(`notifications[${i}].id must be a 32-bit integer`);
    if (seen.has(id)) throw invalid(`notifications[${i}].id ${id} is used twice`);
    seen.add(id);
    if (typeof title !== "string" || title.trim() === "")
      throw invalid(`notifications[${i}].title must be a non-empty string`);
    if (body !== undefined && typeof body !== "string") throw invalid(`notifications[${i}].body must be a string`);
    if (every !== undefined && !REPEATS.includes(every as Repeat))
      throw invalid(`notifications[${i}].every must be one of ${REPEATS.join(", ")}`);
    if (channelId !== undefined && (typeof channelId !== "string" || channelId === ""))
      throw invalid(`notifications[${i}].channelId must be a non-empty string`);
    if (data !== undefined) {
      if (!isPlainObject(data)) throw invalid(`notifications[${i}].data must be a plain JSON object`);
      try {
        JSON.stringify(data);
      } catch {
        throw invalid(`notifications[${i}].data must be JSON`);
      }
    }

    let first: number;
    if (every) {
      const repeat = every as Repeat;
      const limit = addInterval(now, repeat);
      if (at === undefined) first = limit;
      else {
        first = parseAt(at, i);
        if (first > limit) {
          throw invalid(
            `notifications[${i}]: with every "${repeat}", at must be less than one ${repeat} from now (it sets the time of the repeats)`,
          );
        }
        first = nextOccurrence(first, repeat, now);
      }
      // iOS calendar triggers match whole seconds: a series whose time falls in the current second
      // fires right away instead of one interval later (seen on the simulator). Start it a moment early.
      first = Math.min(first, limit - REPEAT_MARGIN);
    } else {
      first = at === undefined ? now : Math.max(now, parseAt(at, i));
    }

    const out: ScheduledNotification = { id, title, body: body ?? "", at: first };
    if (every) out.every = every as Repeat;
    if (channelId) out.channelId = channelId as string;
    if (data) out.data = JSON.parse(JSON.stringify(data)) as NotificationData;
    return out;
  });
  return { notifications };
}

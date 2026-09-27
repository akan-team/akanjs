import { definePlugin, type Plugin } from "../../../packages/core/src/index.ts";
import { usePluginEvent } from "../../../packages/react/src/index.ts";
import { checkIds, normalizeSchedule } from "./schedule.ts";
import { web } from "./web.ts";

/** C1 permission states. Android reports "prompt-with-rationale" after one refusal. */
export type PermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

export type Repeat = "minute" | "hour" | "day" | "week";

/** Android channel importance: "high" pops up (heads-up), "low" is silent, "min" is folded away. */
export type Importance = "min" | "low" | "default" | "high";

/** Any JSON object. It comes back unchanged in getPending, getDelivered and the events. */
export type NotificationData = Record<string, unknown>;

export interface NotificationRequest {
  /** 32-bit integer, unique within the app. Scheduling an id again replaces the earlier one. */
  id: number;
  title: string;
  body?: string;
  /**
   * When to show it: an ISO 8601 date-time (local time without an offset) or epoch milliseconds.
   * Omitted or in the past: right away. With `every` it sets the time of the repeats and must be
   * less than one interval from now.
   */
  at?: string | number;
  /**
   * Repeat until cancelled. Without `at` the first one comes one interval from now (2 s earlier:
   * iOS calendar triggers work in whole seconds). day and week keep the local time of day across DST.
   * Android without the exact-alarm permission delivers each one up to about 75% of the interval late.
   */
  every?: Repeat;
  /**
   * Android channel (createChannel); an unknown one is INVALID_ARGS there. Default: the plugin's
   * "default" channel ("Notifications", default importance). Ignored elsewhere.
   */
  channelId?: string;
  data?: NotificationData;
}

export interface PendingNotification {
  id: number;
  title: string;
  body: string;
  /** Next delivery, epoch ms. */
  at: number;
  every?: Repeat;
  channelId?: string;
  data?: NotificationData;
}

export interface DeliveredNotification {
  id: number;
  title: string;
  body: string;
  /** When it was shown, epoch ms, where the host knows it. */
  at?: number;
  data?: NotificationData;
}

export interface NotificationEvent {
  id: number;
  title: string;
  body: string;
  data?: NotificationData;
}

export interface ChannelOptions {
  id: string;
  /** Shown in the system settings. */
  name: string;
  description?: string;
  /** Default "default". Android keeps the user's choice: importance cannot change after creation. */
  importance?: Importance;
}

export interface LocalNotificationsApi {
  /** Requires the display permission (PERMISSION_DENIED otherwise); it never prompts by itself. */
  schedule(args: { notifications: NotificationRequest[] }): Promise<{ ids: number[] }>;
  /** Stops pending (future and repeating) notifications. Shown ones stay: see removeDelivered. */
  cancel(args: { ids: number[] }): Promise<void>;
  getPending(): Promise<{ notifications: PendingNotification[] }>;
  /** Notifications of this plugin still shown in the notification center / shade. */
  getDelivered(): Promise<{ notifications: DeliveredNotification[] }>;
  removeDelivered(args: { ids: number[] }): Promise<void>;
  /** Removes every shown notification of this plugin (push notifications are not touched). */
  removeAllDelivered(): Promise<void>;
  /** Android notification channel. Resolves without doing anything on other platforms. */
  createChannel(args: ChannelOptions): Promise<void>;
  checkPermission(): Promise<{ display: PermissionState }>;
  /**
   * Shows the system prompt when the state is "prompt" (web: call it from a click).
   * iOS `provisional: true` grants quiet delivery (Notification Center only, no banner or sound)
   * without a prompt; a later requestPermission() without it still shows the prompt. Ignored elsewhere.
   */
  requestPermission(args?: { provisional?: boolean }): Promise<{ display: PermissionState }>;
}

export interface LocalNotificationsEvents {
  /** A notification was shown while the app is in the foreground (web: while the page runs). */
  received: NotificationEvent;
  /**
   * The user tapped a notification. A tap that launched or resumed the app before anything listened
   * is delivered to the first listener (plugins.md C2).
   */
  action: NotificationEvent;
}

export const METHODS = [
  "schedule",
  "cancel",
  "getPending",
  "getDelivered",
  "removeDelivered",
  "removeAllDelivered",
  "createChannel",
  "checkPermission",
  "requestPermission",
] as const;

const raw = definePlugin<LocalNotificationsApi, LocalNotificationsEvents>("local-notifications", {
  methods: METHODS,
  events: ["received", "action"],
  web,
});

/** Runs the check synchronously so a rejected argument never reaches the host. */
function checked<A, R>(check: (args: unknown) => A, call: (args: A) => Promise<R>): (args: unknown) => Promise<R> {
  return (args) => {
    let valid: A;
    try {
      valid = check(args);
    } catch (error) {
      return Promise.reject(error);
    }
    return call(valid);
  };
}

/**
 * Local notifications: scheduled on the device, no server. The page resolves dates before calling
 * the host (see schedule.ts), so every host gets the same arguments.
 * Windows and Linux keep no schedule for apps: the app shows its pending notifications itself, so
 * they are delivered only while it runs (the web: while the page is open), and taps arrive only
 * then. A Linux session without a notification server is UNSUPPORTED.
 */
export const localNotifications: Plugin<LocalNotificationsApi, LocalNotificationsEvents> = Object.freeze({
  ...raw,
  schedule: checked(
    (args) => normalizeSchedule(args, Date.now()),
    (args) => raw.schedule(args),
  ),
  cancel: checked(
    (args) => ({ ids: checkIds(args, "cancel") }),
    (args) => raw.cancel(args),
  ),
  removeDelivered: checked(
    (args) => ({ ids: checkIds(args, "removeDelivered") }),
    (args) => raw.removeDelivered(args),
  ),
});

/** Calls `handler` for every tapped notification while mounted, including the one that launched the app. */
export function useNotificationAction(handler: (event: NotificationEvent) => void): void {
  usePluginEvent(localNotifications, "action", handler);
}

/** Calls `handler` for every notification shown while the app is in the foreground. */
export function useNotificationReceived(handler: (event: NotificationEvent) => void): void {
  usePluginEvent(localNotifications, "received", handler);
}

export { addInterval, nextOccurrence, normalizeSchedule, type ScheduledNotification } from "./schedule.ts";

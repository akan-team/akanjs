// Desktop: the native shell's notify.* ops, the same on every desktop OS:
// - macOS: UNUserNotificationCenter as the app itself (native/desktop/src/notify.rs; plugins.md
//   Q-P6 (b1): the framework through the objc2 runtime, no binding crate). Same request layout and
//   behaviour as the iOS plugin: the id is the request identifier, userInfo carries a marker, the
//   target time, the repeat and the data as JSON text.
// - Windows: toast notifications of the app's AppUserModelID (win/notify.rs); Linux: the desktop's
//   notification server over D-Bus (linux/notify.rs). Neither schedules for the app, so the shell
//   keeps pending ones itself (notify_schedule.rs) while the app runs, and in the app data folder
//   (`store`), from which the next launch schedules them again. Nothing is delivered while the
//   app is not running: a notification that came due meanwhile shows at the next launch. Showing
//   needs no permission there; a Linux session without a notification server is UNSUPPORTED.
//   Clicks arrive while the app runs.
// - Every op carries `app` {id, name}: the AppUserModelID and display name on Windows, the
//   app_name on Linux; macOS ignores it.
// - macOS: the shell is the center's delegate from launch (Info.plist AkanNativeUserNotifications, set by this
//   plugin's manifest), so a click that starts the app still arrives; clicks before the page listens
//   are kept for the first listener (plugins.md C2). Banners also show while the app is frontmost.
// - macOS: replaces the AppleScript interim (banners attributed to Script Editor, no clicks, nothing
//   registered with the OS). Electrobun also uses UNUserNotificationCenter for bundled apps
//   (electrobun/package/src/native/macos/nativeWrapper.mm:8438-8470).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin, type NativeEvent } from "../../../packages/desktop/src/plugin.ts";
import type {
  DeliveredNotification,
  LocalNotificationsApi,
  LocalNotificationsEvents,
  NotificationData,
  NotificationEvent,
  PendingNotification,
  PermissionState,
  Repeat,
} from "./index.ts";
import { checkIds, checkScheduled } from "./schedule.ts";

/** A request as notify.rs reports it (pending, delivered, events). */
export interface NativeRequest {
  id: string | null;
  title: string | null;
  body: string | null;
  /** userInfo data: JSON text. */
  data: string | null;
  /** userInfo target time, epoch ms. */
  at: number | null;
  every: string | null;
  /** Next date of a calendar (repeating) trigger. */
  next: number | null;
  /** When it was shown (delivered list). */
  date: number | null;
  /** Carries this plugin's marker. */
  ours: boolean;
}

/** UNAuthorizationStatus: 0 notDetermined, 1 denied, 2 authorized, 3 provisional, 4 ephemeral. */
export function permissionState(status: number): PermissionState {
  if (status === 2 || status === 3 || status === 4) return "granted";
  if (status === 1) return "denied";
  return "prompt";
}

/** Ours and with a 32-bit integer id (other requests of the app, e.g. push, are left alone). */
function mine(r: NativeRequest): r is NativeRequest & { id: string } {
  if (!r.ours || r.id === null || !/^-?\d+$/.test(r.id)) return false;
  const id = Number(r.id);
  return id >= -2147483648 && id <= 2147483647;
}

function dataOf(r: NativeRequest): NotificationData | undefined {
  if (r.data === null) return undefined;
  try {
    const value = JSON.parse(r.data);
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function eventOf(r: NativeRequest & { id: string }): NotificationEvent {
  const event: NotificationEvent = { id: Number(r.id), title: r.title ?? "", body: r.body ?? "" };
  const data = dataOf(r);
  if (data) event.data = data;
  return event;
}

const REPEATS = new Set(["minute", "hour", "day", "week"]);

export function pendingOf(r: NativeRequest & { id: string }): PendingNotification {
  const n: PendingNotification = { ...eventOf(r), at: r.next ?? r.at ?? 0 };
  if (r.every && REPEATS.has(r.every)) n.every = r.every as Repeat;
  return n;
}

function deliveredOf(r: NativeRequest & { id: string }): DeliveredNotification {
  const n: DeliveredNotification = eventOf(r);
  if (r.date !== null) n.at = r.date;
  return n;
}

/**
 * A notify.* op with the app it is for and, on Windows and Linux, the file the shell keeps the
 * pending notifications in, so they are scheduled again at the next launch (notify_schedule.rs).
 */
const shell = (ctx: DesktopContext, op: string, args: Record<string, unknown> = {}) =>
  ctx.shell(op, {
    ...args,
    app: { id: ctx.app.id, name: ctx.app.name },
    ...(process.platform === "darwin" ? {} : { store: storePath(ctx) }),
  });
const storePath = (ctx: DesktopContext) => join(ctx.appDataDir, "notifications.json");

/** Kept for the first `action` listener (plugins.md C2). */
const BUFFER = 16;

export function createDesktopNotifications() {
  const received = new Set<(e: NotificationEvent) => void>();
  const action = new Set<(e: NotificationEvent) => void>();
  const pendingActions: NotificationEvent[] = [];

  const status = async (ctx: DesktopContext) => ((await shell(ctx, "notify.status")) as { status: number }).status;
  const list = async (ctx: DesktopContext, op: "notify.pending" | "notify.delivered") =>
    ((await shell(ctx, op)) as NativeRequest[]).filter(mine);

  const onNative = (e: NativeEvent) => {
    const r = e.notification as NativeRequest | undefined;
    if (!r || !mine(r)) return;
    const event = eventOf(r);
    if (e.event === "received") for (const listener of received) listener(event);
    else if (e.event === "action") {
      if (action.size === 0) {
        pendingActions.push(event);
        if (pendingActions.length > BUFFER) pendingActions.shift();
      } else for (const listener of action) listener(event);
    }
  };

  return defineDesktopPlugin<LocalNotificationsApi, LocalNotificationsEvents>({
    id: "local-notifications",
    setup(ctx) {
      // From launch: a click that started the app arrives before any page listens.
      ctx.onNativeEvent("notification", onNative);
      // Windows, Linux: what was pending when the app last quit is scheduled again once the shell
      // runs ("init"); the macOS notification center kept it by itself.
      if (process.platform !== "darwin" && existsSync(storePath(ctx))) {
        ctx.onNativeEvent(
          "init",
          () =>
            void shell(ctx, "notify.restore").catch((error) =>
              console.error("[akan-native] local-notifications: cannot restore the pending notifications", error),
            ),
        );
      }
    },
    methods: {
      async schedule(args, ctx) {
        const items = checkScheduled(args);
        // Checked first so every platform answers the same way without the permission.
        if (permissionState(await status(ctx)) !== "granted") {
          throw new AkanNativeError(
            "PERMISSION_DENIED",
            "notification permission is not granted (call requestPermission)",
          );
        }
        await shell(ctx, "notify.add", {
          items: items.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            at: n.at,
            ...(n.every ? { every: n.every } : {}),
            ...(n.data ? { data: JSON.stringify(n.data) } : {}),
          })),
        });
        return { ids: items.map((n) => n.id) };
      },
      async cancel(args, ctx) {
        await shell(ctx, "notify.removePending", { ids: checkIds(args, "cancel").map(String) });
      },
      getPending: async (_args, ctx) => ({
        notifications: (await list(ctx, "notify.pending")).map(pendingOf).sort((a, b) => a.at - b.at),
      }),
      getDelivered: async (_args, ctx) => ({ notifications: (await list(ctx, "notify.delivered")).map(deliveredOf) }),
      async removeDelivered(args, ctx) {
        await shell(ctx, "notify.removeDelivered", { ids: checkIds(args, "removeDelivered").map(String) });
      },
      async removeAllDelivered(_args, ctx) {
        const ids = (await list(ctx, "notify.delivered")).map((r) => r.id);
        if (ids.length) await shell(ctx, "notify.removeDelivered", { ids });
      },
      createChannel: () => {},
      checkPermission: async (_args, ctx) => ({ display: permissionState(await status(ctx)) }),
      // provisional: quiet delivery without a prompt; a later request without it still prompts (iOS).
      async requestPermission(args, ctx) {
        const provisional = (args as { provisional?: unknown } | undefined)?.provisional === true;
        const now = await status(ctx);
        if (now !== 0 && !(now === 3 && !provisional)) return { display: permissionState(now) };
        const after = (await shell(ctx, "notify.request", { provisional })) as { status: number };
        return { display: permissionState(after.status) };
      },
    },
    events: {
      received(emit) {
        received.add(emit);
        return () => received.delete(emit);
      },
      action(emit) {
        action.add(emit);
        for (const event of pendingActions.splice(0)) emit(event);
        return () => action.delete(emit);
      },
    },
  });
}

export default createDesktopNotifications();

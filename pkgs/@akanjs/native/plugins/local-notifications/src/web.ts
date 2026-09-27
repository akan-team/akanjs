import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type {
  DeliveredNotification,
  LocalNotificationsApi,
  LocalNotificationsEvents,
  NotificationEvent,
  PermissionState,
} from "./index.ts";
import { checkIds, checkScheduled, type ScheduledNotification } from "./schedule.ts";
import { NotificationTimers, systemTimers } from "./timers.ts";

// Web: the Notification API (window.Notification).
// - Scheduling uses timers in the page, so it only works while the page stays open; nothing is
//   delivered after the tab closes (a push service would be needed). A background tab's timers may
//   be delayed by the browser. capacitor-plugins/local-notifications/src/web.ts does the same.
// - requestPermission needs a user gesture in Safari and Firefox: call it from a click.
// - Chrome on Android refuses the Notification constructor ("Illegal constructor", only service
//   workers may show notifications): a notification due right away rejects UNSUPPORTED there, a
//   later one only logs the failure when its time comes.
// - akan-native's macOS WKWebView has window.Notification, but requestPermission() never leaves "default"
//   (checked), so macOS uses desktop.ts instead.
// - Checked in headless Chrome with the permission granted over CDP: schedule, timers, getPending,
//   getDelivered, cancel, removeAllDelivered. close() did not fire "close" there.

type Emit<T> = (data: T) => void;

let emitReceived: Emit<NotificationEvent> | null = null;
let emitAction: Emit<NotificationEvent> | null = null;
/** Taps before anything listened (plugins.md C2). */
const pendingActions: NotificationEvent[] = [];
/** Notifications this page showed and that are still open. */
const shown = new Map<number, { notification: Notification; info: DeliveredNotification }>();

function api(): typeof Notification | null {
  return typeof Notification === "function" ? Notification : null;
}

function state(): PermissionState {
  const N = api();
  if (!N) throw new AkanNativeError("UNSUPPORTED", "this browser has no Notification API");
  return N.permission === "granted" ? "granted" : N.permission === "denied" ? "denied" : "prompt";
}

function eventOf(n: ScheduledNotification): NotificationEvent {
  const event: NotificationEvent = { id: n.id, title: n.title, body: n.body };
  if (n.data) event.data = n.data;
  return event;
}

/** close() does not always fire "close" (headless Chrome, checked), so forget it here too. */
function dismiss(id: number): void {
  const entry = shown.get(id);
  if (!entry) return;
  shown.delete(id);
  entry.notification.close();
}

function show(n: ScheduledNotification): void {
  const N = api();
  if (!N || N.permission !== "granted") return; // permission revoked meanwhile
  dismiss(n.id);
  // tag: the browser replaces an open notification with the same id.
  const notification = new N(n.title, { body: n.body, tag: `akan-native-${n.id}` });
  const info: DeliveredNotification = { id: n.id, title: n.title, body: n.body, at: Date.now() };
  if (n.data) info.data = n.data;
  shown.set(n.id, { notification, info });
  notification.onclose = () => {
    if (shown.get(n.id)?.notification === notification) shown.delete(n.id);
  };
  notification.onclick = () => {
    try {
      window.focus();
    } catch {}
    dismiss(n.id);
    const event = eventOf(n);
    if (emitAction) emitAction(event);
    else pendingActions.push(event);
  };
  emitReceived?.(eventOf(n));
}

/** Set while schedule() shows due notifications itself, so their errors reach the caller. */
let throwing = false;

const timers = new NotificationTimers({
  ...systemTimers,
  show(n) {
    try {
      show(n);
    } catch (error) {
      if (throwing)
        throw error instanceof TypeError
          ? new AkanNativeError("UNSUPPORTED", "this browser only shows notifications from a service worker")
          : error;
      console.warn("[akan-native] local-notifications: showing a notification failed", error);
    }
  },
});

export const web = defineWebPlugin<LocalNotificationsApi, LocalNotificationsEvents>({
  methods: {
    async schedule(args) {
      const list = checkScheduled(args); // normalized by the page wrapper (schedule.ts)
      const N = api();
      if (!N) throw new AkanNativeError("UNSUPPORTED", "this browser has no Notification API");
      if (N.permission !== "granted")
        throw new AkanNativeError(
          "PERMISSION_DENIED",
          "notification permission is not granted (call requestPermission)",
        );
      throwing = true;
      try {
        return { ids: timers.schedule(list) };
      } finally {
        throwing = false;
      }
    },
    async cancel(args) {
      timers.cancel(checkIds(args, "cancel"));
    },
    getPending: async () => ({ notifications: api() ? timers.list() : [] }),
    getDelivered: async () => ({ notifications: [...shown.values()].map(({ info }) => ({ ...info })) }),
    async removeDelivered(args) {
      for (const id of checkIds(args, "removeDelivered")) dismiss(id);
    },
    async removeAllDelivered() {
      for (const id of [...shown.keys()]) dismiss(id);
    },
    async createChannel() {},
    checkPermission: async () => ({ display: state() }),
    requestPermission() {
      // Synchronous up to requestPermission(): Safari only prompts inside the click.
      const N = api();
      if (!N) return Promise.reject(new AkanNativeError("UNSUPPORTED", "this browser has no Notification API"));
      if (N.permission !== "default") return Promise.resolve({ display: state() });
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve({ display: state() });
        };
        // Old Safari only takes the callback form and returns undefined.
        const result = N.requestPermission(finish);
        if (result && typeof result.then === "function") result.then(finish, finish);
      });
    },
  },
  events: {
    received(emit) {
      emitReceived = emit;
      return () => {
        emitReceived = null;
      };
    },
    action(emit) {
      emitAction = emit;
      for (const event of pendingActions.splice(0)) emit(event);
      return () => {
        emitAction = null;
      };
    },
  },
});

/** For tests: forget everything this module keeps. */
export function resetWebState(): void {
  for (const id of [...shown.keys()]) dismiss(id);
  pendingActions.length = 0;
  timers.cancel(timers.list().map((n) => n.id));
}

import { definePlugin } from "../../../packages/core/src/index.ts";
import { usePluginEvent } from "../../../packages/react/src/index.ts";

// Remote notifications (akanjs readiness O6-2): APNs directly on iOS (no Firebase), Firebase Cloud
// Messaging on Android (the pinned, opt-in FCM module: native/android/maven.lock.json). The server
// sends to the token's provider: APNs with the app's .p8 key, FCM with firebase-admin. The web and
// desktops have none (UNSUPPORTED). Android needs android.googleServices (google-services.json).

/** C1 permission states. Android reports "prompt-with-rationale" after one refusal. */
export type PushPermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

export type PushProvider = "apns" | "fcm";

/** Where the server sends: an APNs device token (hex) or an FCM registration token. */
export interface PushToken {
  token: string;
  provider: PushProvider;
  platform: "ios" | "android";
}

export interface PushMessage {
  /** APNs: the notification's request identifier. FCM: the message id. */
  id?: string;
  title?: string;
  body?: string;
  /** The payload's own keys: APNs userInfo without "aps", FCM data. */
  data: Record<string, unknown>;
}

export interface PushAction {
  /** "tap" for the notification itself, else the action's identifier. */
  actionId: string;
  message: PushMessage;
}

/** How a push that arrives while the app is in front is shown. Default: not shown (the page gets "received"). */
export interface PushPresentation {
  banner?: boolean;
  list?: boolean;
  sound?: boolean;
  badge?: boolean;
  /**
   * Not shown when its `data[key]` is one of `values`, e.g. the chat room on screen: `{ key: "url", values: [path] }`.
   * It still arrives as "received".
   */
  except?: PushPresentationExcept;
}

export interface PushPresentationExcept {
  key: string;
  values: string[];
}

export interface PushApi {
  checkPermission(): Promise<{ display: PushPermissionState }>;
  /** Asks for permission to show notifications (Android 13+ and iOS; granted earlier on older Android). */
  requestPermission(): Promise<{ display: PushPermissionState }>;
  /** Registers with APNs or FCM; resolves with the token. A later change arrives as "token". */
  register(): Promise<PushToken>;
  /** Stops pushes to this installation (APNs unregister; FCM deletes the token). */
  unregister(): Promise<void>;
  setForegroundPresentation(args: PushPresentation): Promise<void>;
}

export interface PushEvents {
  /**
   * The token changed (FCM refreshes it; APNs after a restore). Send it to the server again. A change
   * while no page listened is kept (the latest) and goes to the first listener.
   */
  token: PushToken;
  /** A push arrived while the app runs (shown or not, per setForegroundPresentation). */
  received: PushMessage;
  /** The user tapped a push. The tap that launched the app is kept until the first listener. */
  action: PushAction;
}

export const push = definePlugin<PushApi, PushEvents>("push", {
  methods: ["checkPermission", "requestPermission", "register", "unregister", "setForegroundPresentation"],
  events: ["token", "received", "action"],
});

/** Subscribes to a push event for the component's lifetime. */
export function usePushEvent<E extends keyof PushEvents & string>(
  event: E,
  handler: (data: PushEvents[E]) => void,
): void {
  usePluginEvent(push, event, handler);
}

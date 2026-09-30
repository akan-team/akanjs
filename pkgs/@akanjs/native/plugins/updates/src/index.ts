import { createLiveValue, definePlugin, isAkanNativeError } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";

/**
 * Over-the-air updates. On iOS and Android they replace the web bundle (UP-2); the native code
 * stays, so a bundle only runs in a binary with the same native API (UP-3, `nativeApi`). On macOS,
 * Windows and Linux they replace the whole app (UP-1). Releases are made with
 * `akan-native update publish <platform>` and signed with the key of `akan-native update keygen`.
 *
 * A new bundle first runs on trial: the app calls notifyReady() once it works. A trial that does
 * not confirm within `updates.readyTimeout` (akan-native.config.ts, default 10 s), or that crashes and is
 * launched again, is rolled back to the previous bundle. On a desktop app that carries a server, the
 * trial also waits for that server to answer and stay up.
 */
export interface UpdateState {
  /** The downloaded bundle running now; null = the one inside the app. */
  bundle: string | null;
  /** Its sequence (publish time, seconds); 0 for the app's own bundle. */
  sequence: number;
  /** Downloaded and verified, runs at the next launch or after apply(). */
  pending: string | null;
  /** Running for the first time: call notifyReady() once the app works, or it is rolled back. */
  trial: boolean;
  /** The last bundle that was rolled back, if any. */
  rolledBack: string | null;
  /** The manifest channel (akan-native.config.ts `updates.channel`). */
  channel: string;
  /** What this binary provides natively (UP-3); bundles for another value are ignored. */
  nativeApi: string | null;
}

export interface UpdateCheck {
  /**
   * A newer bundle for this binary exists (not rolled back before). Desktop: never the release on trial, nor one whose
   * server presence differs from this app's.
   */
  available: boolean;
  bundle: string | null;
  /** The app version it was published with. */
  version: string | null;
  sequence: number | null;
  /** Bytes still to download; files the running bundle already has are copied. */
  downloadSize: number | null;
}

export interface UpdateProgress {
  received: number;
  total: number;
}

export interface UpdatesApi {
  getState(): Promise<UpdateState>;
  /** Fetches and verifies the signed manifest. Rejects NOT_FOUND when nothing is published, INTERNAL for a bad signature. */
  check(): Promise<UpdateCheck>;
  /** Downloads and verifies the latest bundle; it runs at the next launch (or apply()). */
  download(): Promise<{ bundle: string }>;
  /**
   * Phones: reloads the page into the downloaded bundle now (on trial). Desktop: replaces the app with the download and
   * relaunches it (on trial); rejects NOT_ALLOWED while the running release is still on trial. Rejects NOT_FOUND
   * without a download.
   */
  apply(): Promise<void>;
  /** The running bundle works: keep it. Call it once the app has started; harmless otherwise. */
  notifyReady(): Promise<void>;
  /**
   * Phones: back to the app's own bundle from the next launch on. Desktop: drops the download and forgets the refused
   * releases; the running app stays, and a trial keeps its record.
   */
  reset(): Promise<void>;
}

export interface UpdatesEvents {
  progress: UpdateProgress;
}

export const updates = definePlugin<UpdatesApi, UpdatesEvents>("updates", {
  methods: ["getState", "check", "download", "apply", "notifyReady", "reset"],
  events: ["progress"],
});

/**
 * notifyReady() where updates exist, nothing elsewhere (web, apps without updates configured).
 * Call it once the app has rendered.
 */
export async function markReady(): Promise<void> {
  if (!updates.isSupported("notifyReady")) return;
  try {
    await updates.notifyReady();
  } catch (error) {
    if (!isAkanNativeError(error, "UNSUPPORTED")) throw error;
  }
}

const state = createLiveValue<UpdateState | null>(null, (set) => {
  if (updates.isSupported("getState")) updates.getState().then(set, () => set(null));
});

/** The update state, refreshed after download/apply through `refresh()`. null where updates do not exist. */
export function useUpdateState(): { state: UpdateState | null; refresh: () => Promise<void> } {
  const value = useLiveValue(state);
  return {
    state: value,
    refresh: async () => {
      if (updates.isSupported("getState")) state.set(await updates.getState());
    },
  };
}

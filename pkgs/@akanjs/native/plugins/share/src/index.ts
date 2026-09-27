// A namespace import: under React Server Components (react-server) react has no hooks, and named
// imports of them would fail when this module is linked (docs/api.md, O2-3).
import * as React from "react";
import { AkanNativeError, definePlugin } from "../../../packages/core/src/index.ts";
import { web, webShareAvailable } from "./web.ts";

export interface ShareOptions {
  /** Subject line for mail-like targets, preview title on Android. */
  title?: string;
  text?: string;
  /** An absolute URL. On Android it is appended to the text (the intent has one text field). */
  url?: string;
  /**
   * Files as FileRef URLs (`/__akan_native/file/<id>`) returned by other plugins, e.g. camera.takePhoto().
   * On the web also blob: and same-origin URLs. Not yet on Android (see canShare).
   */
  files?: string[];
}

export interface ShareResult {
  /** False when the user closed the share sheet without choosing a target. */
  completed: boolean;
  /**
   * What received the share, when the platform tells: the package name on Android, the activity type
   * on iOS (com.apple.UIKit.activity.Mail, …). Missing on the web and when unknown.
   */
  target?: string;
}

/**
 * The system share sheet: UIActivityViewController (iOS), the Android chooser, navigator.share
 * (web, and the desktop WebView: WKWebView on macOS, WebView2 on Windows). Linux has no share
 * sheet (WebKitGTK has no navigator.share): canShare() answers false and share() rejects
 * UNSUPPORTED. Closing the sheet resolves `{ completed: false }` rather than rejecting, as
 * react-native Share does ("dismissedAction").
 */
export interface ShareApi {
  /**
   * Opens the share sheet. Needs a user gesture on the web (call it from a click, before any await).
   * Rejects INVALID_ARGS without text, url or files, CANCELLED while another share sheet is open,
   * UNSUPPORTED where sharing (or sharing these files) is not available.
   */
  share(options: ShareOptions): Promise<ShareResult>;
  /**
   * Whether share() would work for these options; without options (or with {}) whether a share sheet
   * exists at all. Invalid options answer false instead of rejecting, as navigator.canShare does.
   */
  canShare(options?: ShareOptions): Promise<{ value: boolean }>;
}

export const share = definePlugin<ShareApi>("share", {
  methods: ["share", "canShare"],
  web,
});

export interface UseShare {
  /** False where no share sheet exists (desktop Firefox, insecure origins): hide the share button. */
  supported: boolean;
  pending: boolean;
  /** Last failure. Closing the sheet is not a failure. */
  error: AkanNativeError | null;
  /** Resolves null on failure (see `error`). */
  share(options: ShareOptions): Promise<ShareResult | null>;
}

export function useShare(): UseShare {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<AkanNativeError | null>(null);

  const run = React.useCallback(async (options: ShareOptions) => {
    setPending(true);
    setError(null);
    try {
      // Called before any await so navigator.share keeps the click's user activation.
      return await share.share(options);
    } catch (e) {
      const err = AkanNativeError.from(e);
      if (err.code !== "CANCELLED") setError(err);
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  const where = share.implementation("share");
  return { supported: where === "native" || (where === "web" && webShareAvailable()), pending, error, share: run };
}

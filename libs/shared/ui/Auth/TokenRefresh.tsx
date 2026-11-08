"use client";

import { persistAuthCookie, refreshBeforeMs, sessionTokenOf } from "@libs/shared/webkit";
import { getStoredAuthToken, resetAuth, router } from "akanjs/client";
import { decodeJwtPayload, Logger } from "akanjs/common";
import { useEffect } from "react";
import type { AuthScope, TokenPayload } from "./tokenRefresh.type";
import { hasScope, isFinalRefreshError } from "./tokenRefresh.util";

interface TokenRefreshProps {
  scope: AuthScope;
  onRefresh: () => Promise<void> | void;
}

const retryDelayMs = 30 * 1000;
const maxRetryDelayMs = 10 * 60 * 1000;

export const TokenRefresh = ({ scope, onRefresh }: TokenRefreshProps) => {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let refreshing = false;
    let disposed = false;
    let failures = 0;
    let restoreTried = false;

    const clearRefreshTimeout = () => {
      if (!timeout) return;
      clearTimeout(timeout);
      timeout = null;
    };

    // The access cookie is gone — a phone dropped it with the app process — while this browser still holds a signed-in
    // token and, maybe, the 30-day refresh cookie. One refresh answers which; the route re-renders on the new cookie.
    const restore = async () => {
      if (restoreTried) return;
      restoreTried = true;
      const stored = await getStoredAuthToken();
      if (!stored || disposed) return;
      try {
        if (!hasScope(decodeJwtPayload<TokenPayload>(stored), scope)) return;
        await onRefresh();
        router.refresh();
        schedule();
      } catch (error) {
        Logger.warn(
          `Could not restore the ${scope} session: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    const schedule = () => {
      clearRefreshTimeout();
      const jwt = sessionTokenOf();
      if (!jwt) {
        void restore();
        return;
      }

      let payload: TokenPayload;
      try {
        payload = decodeJwtPayload<TokenPayload>(jwt);
      } catch {
        return;
      }
      if (!hasScope(payload, scope) || !payload.exp) return;
      persistAuthCookie();

      const expiresAt = payload.exp * 1000;
      const delay = Math.max(expiresAt - Date.now() - refreshBeforeMs, 0);
      timeout = setTimeout(async () => {
        if (refreshing || disposed) return;
        refreshing = true;
        // A phone that slept past the token's expiry rendered this page with a token the server refused.
        const wasExpired = expiresAt <= Date.now();
        try {
          await onRefresh();
          failures = 0;
          if (wasExpired) router.refresh();
          schedule();
        } catch (error) {
          Logger.warn(`Failed to refresh ${scope} token: ${error instanceof Error ? error.message : String(error)}`);
          if (isFinalRefreshError(error)) {
            if (!wasExpired) return;
            resetAuth();
            router.refresh();
            return;
          }
          failures += 1;
          timeout = setTimeout(schedule, Math.min(retryDelayMs * 2 ** (failures - 1), maxRetryDelayMs));
        } finally {
          refreshing = false;
        }
      }, delay);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") schedule();
      else persistAuthCookie();
    };

    // Not now: this effect runs before the root's, and the root's `initAuth` rewrites the cookie without a Max-Age.
    const start = setTimeout(schedule, 0);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    // A home-screen app can be swiped away without a visibilitychange; pagehide is the more reliable last call.
    window.addEventListener("pagehide", persistAuthCookie);
    return () => {
      disposed = true;
      clearTimeout(start);
      clearRefreshTimeout();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("pagehide", persistAuthCookie);
    };
  }, [scope]);

  return null;
};

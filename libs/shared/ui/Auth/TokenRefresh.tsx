"use client";

import { persistAuthCookie, refreshBeforeMs, sessionTokenOf } from "@libs/shared/webkit";
import { getStoredAuthToken, resetAuth, router } from "akanjs/client";
import { decodeJwtPayload, Logger } from "akanjs/common";
import { useEffect } from "react";
import type { AuthScope, TokenPayload } from "./tokenRefresh.type";
import { hasScope, isFinalRefreshError, retryDelayOf } from "./tokenRefresh.util";

interface TokenRefreshProps {
  scope: AuthScope;
  onRefresh: () => Promise<void> | void;
}

const recheckMs = 60 * 1000;

export const TokenRefresh = ({ scope, onRefresh }: TokenRefreshProps) => {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let refreshing = false;
    let disposed = false;
    let failures = 0;
    let restoreTried = false;
    //* Set while a failed refresh is retried: the other scope's refresh may leave a token that no longer names this one.
    let owed: number | null = null;

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

    const holdsScope = () => {
      try {
        return hasScope(decodeJwtPayload<TokenPayload>(sessionTokenOf() ?? ""), scope);
      } catch {
        return false;
      }
    };

    const refresh = async (expiresAt: number) => {
      if (refreshing || disposed) return;
      refreshing = true;
      // A phone that slept past the token's expiry rendered this page with a token the server refused.
      const wasExpired = expiresAt <= Date.now();
      try {
        await onRefresh();
        failures = 0;
        owed = null;
        if (wasExpired) router.refresh();
        schedule();
      } catch (error) {
        Logger.warn(`Failed to refresh ${scope} token: ${error instanceof Error ? error.message : String(error)}`);
        if (isFinalRefreshError(error)) {
          owed = null;
          //? A token without this scope is the other identity's renewed session, which this scope's end leaves alone.
          if (!wasExpired || !holdsScope()) return;
          resetAuth();
          router.refresh();
          return;
        }
        failures += 1;
        owed = expiresAt;
        clearRefreshTimeout();
        timeout = setTimeout(() => void refresh(expiresAt), retryDelayOf(failures));
      } finally {
        refreshing = false;
      }
    };

    const schedule = () => {
      clearRefreshTimeout();
      if (disposed) return;
      if (owed !== null) {
        const expiresAt = owed;
        timeout = setTimeout(() => void refresh(expiresAt), 0);
        return;
      }
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
      const delay = expiresAt - Date.now() - refreshBeforeMs;
      //? A timer does not count the time a device sleeps, so a long wait is cut into rechecks against the clock.
      timeout =
        delay > recheckMs
          ? setTimeout(schedule, recheckMs)
          : setTimeout(() => void refresh(expiresAt), Math.max(delay, 0));
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
    // A laptop that slept with the tab in front wakes without a visibilitychange.
    window.addEventListener("focus", schedule);
    window.addEventListener("online", schedule);
    return () => {
      disposed = true;
      clearTimeout(start);
      clearRefreshTimeout();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("pagehide", persistAuthCookie);
      window.removeEventListener("focus", schedule);
      window.removeEventListener("online", schedule);
    };
  }, [scope]);

  return null;
};

"use client";

import { persistAuthCookie, refreshBeforeMs, SessionClock, sessionTokenOf } from "@libs/shared/webkit";
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
    let held = false;
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

    const heldToken = (): TokenPayload => {
      try {
        return decodeJwtPayload<TokenPayload>(sessionTokenOf() ?? "");
      } catch {
        return {};
      }
    };
    const holdsScope = () => hasScope(heldToken(), scope);

    //? However a token reads on this device's clock, a refresh that was answered is not asked again within a minute.
    const hold = () => {
      clearRefreshTimeout();
      held = true;
      timeout = setTimeout(() => {
        held = false;
        schedule();
      }, recheckMs);
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
        SessionClock.concede(heldToken().iat);
        //? A session held in cookies that lost this scope's identity is answered without an error.
        if (wasExpired || !holdsScope()) router.refresh();
        hold();
      } catch (error) {
        Logger.warn(`Failed to refresh ${scope} token: ${error instanceof Error ? error.message : String(error)}`);
        if (isFinalRefreshError(error)) {
          owed = null;
          SessionClock.concede(heldToken().iat);
          //? A token without this scope is the other identity's renewed session, which this scope's end leaves alone.
          const isOthers = !holdsScope();
          if (!wasExpired && !isOthers) return;
          if (!isOthers) resetAuth();
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
      if (held) return;
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

      const expiresAt = SessionClock.expiresAt(payload.exp, payload.iat);
      const delay = SessionClock.isDoubted(payload.iat) ? 0 : expiresAt - Date.now() - refreshBeforeMs;
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
    const start = setTimeout(() => void SessionClock.ready().then(schedule), 0);
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

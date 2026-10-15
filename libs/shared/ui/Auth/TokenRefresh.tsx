"use client";

import { refreshBeforeMs } from "@libs/shared/webkit";
import { getAuthToken } from "akanjs/client";
import { decodeJwtPayload, Logger } from "akanjs/common";
import { useEffect } from "react";
import type { AuthScope, TokenPayload } from "./tokenRefresh.type";
import { hasScope, isFinalRefreshError, refreshToken } from "./tokenRefresh.util";

interface TokenRefreshProps {
  scope: AuthScope;
}

const retryDelayMs = 30 * 1000;
const maxRetryDelayMs = 10 * 60 * 1000;

export const TokenRefresh = ({ scope }: TokenRefreshProps) => {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let refreshing = false;
    let disposed = false;
    let failures = 0;

    const clearRefreshTimeout = () => {
      if (!timeout) return;
      clearTimeout(timeout);
      timeout = null;
    };

    const schedule = () => {
      clearRefreshTimeout();
      const jwt = getAuthToken();
      if (!jwt) return;

      let payload: TokenPayload;
      try {
        payload = decodeJwtPayload<TokenPayload>(jwt);
      } catch {
        return;
      }
      if (!hasScope(payload, scope) || !payload.exp) return;

      const delay = Math.max(payload.exp * 1000 - Date.now() - refreshBeforeMs, 0);
      timeout = setTimeout(async () => {
        if (refreshing || disposed) return;
        refreshing = true;
        try {
          await refreshToken(scope);
          failures = 0;
          schedule();
        } catch (error) {
          Logger.warn(`Failed to refresh ${scope} token: ${error instanceof Error ? error.message : String(error)}`);
          if (isFinalRefreshError(error)) return;
          failures += 1;
          timeout = setTimeout(schedule, Math.min(retryDelayMs * 2 ** (failures - 1), maxRetryDelayMs));
        } finally {
          refreshing = false;
        }
      }, delay);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      clearRefreshTimeout();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [scope]);

  return null;
};

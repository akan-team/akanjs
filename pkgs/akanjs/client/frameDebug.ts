"use client";

type DebugPayload = Record<string, unknown>;

const debugSessionId = Math.random().toString(36).slice(2, 8);
let debugSeq = 0;

const isFrameDebugEnabled = () => {
  if (typeof window === "undefined") return false;
  const windowWithTarget = window as typeof window & { __AKAN_MOBILE_TARGET__?: unknown };
  const search = new URLSearchParams(window.location.search);
  return (
    Boolean(windowWithTarget.__AKAN_MOBILE_TARGET__) ||
    search.has("akanMobileTarget") ||
    search.get("akanFrameDebug") === "1" ||
    window.localStorage.getItem("akan:debug:frame") === "1"
  );
};

export function debugFrame(event: string, payload: DebugPayload = {}) {
  if (!isFrameDebugEnabled()) return;
  debugSeq += 1;
  console.info(`[akan:frame:${debugSessionId}:${debugSeq}] ${event}`, {
    href: window.location.href,
    now: Math.round(performance.now()),
    ...payload,
  });
}

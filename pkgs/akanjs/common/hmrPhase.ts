export type AkanHmrPhase = "refresh-import" | "react-refresh" | null;

declare global {
  // Browser-only dev signal the Akan HMR client set while applying Fast Refresh; nothing sets it any more.
  var __AKAN_HMR_PHASE__: AkanHmrPhase | undefined;
}

/** @deprecated Always `null`: the dev client that set the phase applies modules through its registry now. */
export function getAkanHmrPhase(): AkanHmrPhase {
  if (typeof globalThis === "undefined") return null;
  const phase = globalThis.__AKAN_HMR_PHASE__;
  if (phase === "refresh-import" || phase === "react-refresh") return phase;
  return null;
}

/** @deprecated Always `false`, for the reason `getAkanHmrPhase` is always `null`. */
export function isAkanHmrApplying(): boolean {
  return getAkanHmrPhase() !== null;
}

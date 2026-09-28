import path from "node:path";
import type {
  BuilderMessage,
  BuildPhase,
  ChangeBatch,
  DevBuildStatus,
  DevChangePlan,
  DevChangeRole,
} from "akanjs/server";
import type { IncrementalBuilderStatus } from "../incrementalBuilder";

const BACKEND_RECOVERY_MAX_ATTEMPTS = 5;

// A page load asks for several routes, but a builder that never returns must not grow the hold queue unbounded.
const HELD_BUILDER_REQUEST_LIMIT = 64;

export const BUILDER_MIN_RSS_RECYCLE_INTERVAL_MS = 30_000;

const BUILDER_TIGHT_RSS_REPORT_LIMIT = 2;

// Far enough above the ceiling that no purge would rescue it; recycle without waiting.
const BUILDER_RSS_HARD_MULTIPLE = 1.5;

const DEV_IDLE_SUSPEND_MS = 300_000;

// A wake that immediately suspends again would flap around whatever woke it.
const DEV_IDLE_MIN_UPTIME_MS = 30_000;

export const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const SERVER_SUFFIXES = [".service.ts", ".document.ts"];

const SHARED_SUFFIXES = [".constant.ts", ".dictionary.ts", ".signal.ts"];

const RUNTIME_METADATA_BASENAMES = new Set(["dict.ts", "sig.ts", "useClient.ts", "useServer.ts"]);

export const shouldRestartBackendByDevPlan = (
  message: Extract<BuilderMessage, { type: "invalidate" }>,
): boolean | null => {
  if (!message.devPlan) return null;
  if (message.devPlan.actions.includes("report-error")) return false;
  if (message.devPlan.actions.includes("restart-builder")) return false;
  return message.devPlan.actions.includes("restart-backend");
};

export const shouldRestartBuilderByDevPlan = (message: Extract<BuilderMessage, { type: "invalidate" }>): boolean =>
  message.devPlan?.actions.includes("restart-builder") ?? false;

export const shouldAbandonBackendRecovery = (attempts: number, maxAttempts = BACKEND_RECOVERY_MAX_ATTEMPTS): boolean =>
  attempts >= maxAttempts;

/** The gateway reports backend failures with `generation: -1`; the host assigns its own counter then. */
export const normalizeBackendReportedGeneration = (generation: number): number | undefined =>
  generation >= 0 ? generation : undefined;

export const shouldRestartDevHostByDevPlan = (message: Extract<BuilderMessage, { type: "invalidate" }>): boolean =>
  message.devPlan?.actions.includes("restart-dev-host") ?? message.kinds.includes("config");

export type BackendLifecycleState = "starting" | "ready" | "restart-pending" | "stopping" | "recovering" | "stopped";

/** Reported, not scraped: in interleaved child output "this app is up" reads like any line mentioning it. */
export type DevHostState = "starting" | "ready" | "restarting" | "recovering" | "suspended" | "failed" | "stopped";

export interface DevHostStateEvent {
  app: string;
  state: DevHostState;
  detail?: string;
}

/** Sent once: the app serves and its boot builds have settled, which is what the next boot wave waits for. */
export interface DevHostBootEvent {
  app: string;
  booted: true;
}

export type DevHostEvent = DevHostStateEvent | DevHostBootEvent;

const devHostStateByBackendState = {
  starting: "starting",
  ready: "ready",
  "restart-pending": "restarting",
  recovering: "recovering",
  stopping: "stopped",
  stopped: "stopped",
} as const satisfies { [key in BackendLifecycleState]: DevHostState };

/** `stopped` is both a planned shutdown and an exhausted crash loop; `gaveUp` maps the latter to `failed`. */
export const devHostStateOf = (state: BackendLifecycleState, gaveUp: boolean): DevHostState =>
  state === "stopped" && gaveUp ? "failed" : devHostStateByBackendState[state];

export interface BackendRestartReason {
  generation?: number;
  files: string[];
  roles: Extract<DevChangeRole, "server" | "shared" | "barrel" | "config">[];
}

const RESTART_ROLE_ORDER: BackendRestartReason["roles"] = ["server", "shared", "barrel", "config"];

const generationValue = (generation: number | undefined): number => generation ?? -1;

export const isLegacyBackendFallbackFile = (file: string, workspaceRoot: string): boolean => {
  const abs = path.resolve(file);
  const ext = path.extname(abs).toLowerCase();
  if (!SOURCE_EXTS.has(ext)) return false;
  const rel = path.relative(path.resolve(workspaceRoot), abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false;
  const parts = rel.split(path.sep).filter(Boolean);
  const [scope] = parts;
  if (scope !== "apps" && scope !== "libs" && scope !== "pkgs") return false;

  const base = path.basename(abs);
  return (
    parts.includes("srvkit") ||
    parts.includes("common") ||
    SERVER_SUFFIXES.some((suffix) => base.endsWith(suffix)) ||
    SHARED_SUFFIXES.some((suffix) => base.endsWith(suffix)) ||
    RUNTIME_METADATA_BASENAMES.has(base) ||
    base === "main.ts" ||
    base === "server.ts"
  );
};

//? The backend's rule (akanjs `DevBuildRecovery`), copied: no exported akanjs subpath reaches it from the CLI bundle.
export const shouldMarkBuildPhaseRecovered = (
  previousByPhase: ReadonlyMap<BuildPhase, DevBuildStatus>,
  status: DevBuildStatus,
): boolean => {
  const previous = previousByPhase.get(status.phase);
  if (!previous || previous.ok || !status.ok) return false;
  const generation = generationValue(status.generation);
  if (status.phase === "route" && status.scope !== undefined && previous.scope !== undefined)
    return status.scope === previous.scope && generation >= previous.generation;
  if (generation !== previous.generation) return generation > previous.generation;
  return status.phase === "backend";
};

/** An ok that recovers nothing leaves the failure standing, for hello and for whatever waits on a clean build. */
export const shouldKeepBuildFailure = (
  previousByPhase: ReadonlyMap<BuildPhase, DevBuildStatus>,
  status: DevBuildStatus,
): boolean =>
  status.ok &&
  previousByPhase.get(status.phase)?.ok === false &&
  !shouldMarkBuildPhaseRecovered(previousByPhase, status);

export const createBackendBuildStatus = ({
  generation,
  ok,
  files = [],
  message,
}: {
  generation: number;
  ok: boolean;
  files?: string[];
  message?: string;
}): DevBuildStatus => ({
  generation,
  phase: "backend",
  ok,
  files,
  message,
});

export const backendRestartReasonFromMessage = (
  message: Extract<BuilderMessage, { type: "invalidate" }>,
): BackendRestartReason => {
  const roleSet = new Set<BackendRestartReason["roles"][number]>();
  for (const role of message.devPlan?.roles ?? []) {
    if (role === "server" || role === "shared" || role === "barrel" || role === "config") roleSet.add(role);
  }
  return {
    generation: message.devPlan?.generation ?? message.generation,
    files: [...new Set(message.files)].sort(),
    roles: RESTART_ROLE_ORDER.filter((role) => roleSet.has(role)),
  };
};

export const mergeBackendRestartReasons = (
  current: BackendRestartReason | null,
  next: BackendRestartReason,
): BackendRestartReason => ({
  generation:
    generationValue(next.generation) >= generationValue(current?.generation) ? next.generation : current?.generation,
  files: [...new Set([...(current?.files ?? []), ...next.files])].sort(),
  roles: RESTART_ROLE_ORDER.filter((role) => current?.roles.includes(role) || next.roles.includes(role)),
});

export const shouldReplaceLastGoodMessage = (
  current:
    | Extract<BuilderMessage, { type: "pages-updated" }>
    | Extract<BuilderMessage, { type: "css-updated" }>
    | undefined,
  next: Extract<BuilderMessage, { type: "pages-updated" }> | Extract<BuilderMessage, { type: "css-updated" }>,
): boolean => !current || generationValue(next.data.generation) >= generationValue(current.data.generation);

export const shouldQueueBuildStatusReplay = (backendReady: boolean, pendingReplayCount: number): boolean =>
  !backendReady || pendingReplayCount > 0;

/** Failing statuses arrive before their generation's invalidate; recycling on one strands the dev server. */
export const hasBuildFailureForGeneration = (
  statusByPhase: ReadonlyMap<BuildPhase, DevBuildStatus>,
  generation: number | undefined,
): boolean => {
  if (typeof generation !== "number") return false;
  for (const status of statusByPhase.values()) {
    //? Not a route's: a replacement builder or a restarted dev host boots without building one, so it cannot hit it.
    if (!status.ok && status.phase !== "route" && status.generation === generation) return true;
  }
  return false;
};

export type BuilderRssRecycleDecision = "unbounded" | "below-ceiling" | "build-failed" | "too-soon" | "recycle";

/** `Bun.build` never returns its native arenas, so recycling the builder is the only bound on its RSS. */
export const decideBuilderRssRecycle = ({
  rssBytes,
  ceilingBytes,
  buildFailed,
  msSinceLastRecycle,
  minIntervalMs = BUILDER_MIN_RSS_RECYCLE_INTERVAL_MS,
}: {
  rssBytes: number;
  ceilingBytes: number | null;
  buildFailed: boolean;
  msSinceLastRecycle: number | null;
  minIntervalMs?: number;
}): BuilderRssRecycleDecision => {
  if (!ceilingBytes) return "unbounded";
  if (rssBytes < ceilingBytes) return "below-ceiling";
  if (buildFailed) return "build-failed";
  if (msSinceLastRecycle !== null && msSinceLastRecycle < minIntervalMs) return "too-soon";
  return "recycle";
};

export type BuilderRssSettleDecision = "recycle-now" | "wait-and-recheck";

export const decideBuilderRssSettle = ({
  rssBytes,
  ceilingBytes,
  hardMultiple = BUILDER_RSS_HARD_MULTIPLE,
}: {
  rssBytes: number;
  ceilingBytes: number;
  hardMultiple?: number;
}): BuilderRssSettleDecision => (rssBytes >= ceilingBytes * hardMultiple ? "recycle-now" : "wait-and-recheck");

export type IdleSuspendDecision =
  | "disabled"
  | "already-suspended"
  | "builder-not-ready"
  | "backend-not-ready"
  | "build-failed"
  | "restart-pending"
  | "too-soon"
  | "suspend";

/** A red build means a save is imminent, and a wake would boot straight back into the same error. */
export const decideIdleSuspend = ({
  enabled,
  suspended,
  builderReady,
  backendReady,
  buildFailed,
  restartPending,
  msSinceWake,
  minUptimeMs = DEV_IDLE_MIN_UPTIME_MS,
}: {
  enabled: boolean;
  suspended: boolean;
  builderReady: boolean;
  backendReady: boolean;
  buildFailed: boolean;
  restartPending: boolean;
  msSinceWake: number | null;
  minUptimeMs?: number;
}): IdleSuspendDecision => {
  if (!enabled) return "disabled";
  if (suspended) return "already-suspended";
  if (!builderReady) return "builder-not-ready";
  if (!backendReady) return "backend-not-ready";
  if (buildFailed) return "build-failed";
  if (restartPending) return "restart-pending";
  if (msSinceWake !== null && msSinceWake < minUptimeMs) return "too-soon";
  return "suspend";
};

/** `undefined` env means the default is on; any non-positive value turns idle suspend off. */
export const resolveIdleSuspendMs = (raw: string | undefined): number | null => {
  if (raw === undefined || raw === "") return DEV_IDLE_SUSPEND_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
};

//? Not a route's: a broken route builds again on its next request, which wakes a suspended builder anyway.
export const hasAnyBuildFailure = (statusByPhase: ReadonlyMap<BuildPhase, DevBuildStatus>): boolean =>
  [...statusByPhase.values()].some((status) => !status.ok && status.phase !== "route");

export const shouldRefreshConfigOnIdleWake = (batch: ChangeBatch | null): boolean =>
  !!batch && batch.kinds.has("config");

// `recycling` too: a draining builder is alive and refuses; nothing brings a `stopped` one back, so it fails fast.
const RETURNING_BUILDER_STATUSES = new Set<IncrementalBuilderStatus>(["starting", "recycling", "restarting"]);
export const shouldHoldForReturningBuilder = ({
  status,
  heldCount,
  limit = HELD_BUILDER_REQUEST_LIMIT,
}: {
  status: IncrementalBuilderStatus;
  heldCount: number;
  limit?: number;
}): boolean => RETURNING_BUILDER_STATUSES.has(status) && heldCount < limit;

/** Warn only, never stop enforcing: dropping the ceiling is how a container gets OOM-killed. */
export const shouldWarnBuilderRssCeilingTight = (
  reportsSinceRecycle: number,
  limit = BUILDER_TIGHT_RSS_REPORT_LIMIT,
): boolean => reportsSinceRecycle >= limit;

/** Takes a fresh replacement's RSS: the floor every future replacement lands on. */
export const isRssCeilingUnreachable = (freshRssBytes: number | null, ceilingBytes: number | null): boolean =>
  freshRssBytes !== null && ceilingBytes !== null && freshRssBytes >= ceilingBytes;

/** Both identities are content hashes (`pages-[hash].js`, `<name>-[hash].css`), unchanged by a clean recycle. */
export const shouldRelayRecycledFrontendState = (
  current:
    | Extract<BuilderMessage, { type: "pages-updated" }>
    | Extract<BuilderMessage, { type: "css-updated" }>
    | undefined,
  next: Extract<BuilderMessage, { type: "pages-updated" }> | Extract<BuilderMessage, { type: "css-updated" }>,
): boolean => {
  if (!current || current.type !== next.type) return true;
  if (current.type === "pages-updated" && next.type === "pages-updated")
    return current.data.bundlePath !== next.data.bundlePath;
  if (current.type === "css-updated" && next.type === "css-updated")
    return JSON.stringify(current.data.cssAssets) !== JSON.stringify(next.data.cssAssets);
  return true;
};

const mergeDevPlans = (current?: DevChangePlan, next?: DevChangePlan): DevChangePlan | undefined => {
  if (!current) return next;
  if (!next) return current;
  const reasonByFile: Record<string, string[]> = { ...current.reasonByFile };
  for (const [file, reasons] of Object.entries(next.reasonByFile)) {
    reasonByFile[file] = [...new Set([...(reasonByFile[file] ?? []), ...reasons])].sort();
  }
  return {
    generation: Math.max(current.generation, next.generation),
    files: [...new Set([...current.files, ...next.files])].sort(),
    generatedFiles: [...new Set([...current.generatedFiles, ...next.generatedFiles])].sort(),
    roles: [...new Set([...current.roles, ...next.roles])].sort(),
    actions: [...new Set([...current.actions, ...next.actions])].sort(),
    reasonByFile,
  };
};

export const mergeInvalidateMessages = (
  current: Extract<BuilderMessage, { type: "invalidate" }>,
  next: Extract<BuilderMessage, { type: "invalidate" }>,
): Extract<BuilderMessage, { type: "invalidate" }> => {
  const generation = Math.max(generationValue(current.generation), generationValue(next.generation));
  return {
    type: "invalidate",
    kinds: [...new Set([...current.kinds, ...next.kinds])].sort(),
    files: [...new Set([...current.files, ...next.files])].sort(),
    generation: generation >= 0 ? generation : undefined,
    devPlan: mergeDevPlans(current.devPlan, next.devPlan),
  };
};

export const buildStatusReplaySequence = (
  pendingReplay: readonly DevBuildStatus[],
  latestByPhase: ReadonlyMap<BuildPhase, DevBuildStatus>,
): DevBuildStatus[] => [...pendingReplay, ...latestByPhase.values()];

/** `mtimeMs:size` per file. */
export type SourceFingerprints = ReadonlyMap<string, string>;

/** Only files in `before`: a file that did not exist then is not running anywhere. */
export const filesChangedSince = (before: SourceFingerprints, after: SourceFingerprints): string[] =>
  [...before].filter(([file, stamp]) => after.get(file) !== stamp).map(([file]) => file);

import type { SsrManifest } from "../ssrTypes";

export interface BuildRouteResultPayload {
  manifestDelta: Record<string, { id: string; chunks: string[]; name: string; async: boolean }>;
  ssrManifestDelta: Record<string, Record<string, { id: string; chunks: string[]; name: string; async: boolean }>>;
  newEntries: string[];
  discoveredEntries?: string[];
  clientDeps: string[];
  clientDepsByEntry?: Record<string, string[]>;
  routeId?: string;
  generation?: number;
  /** The newest save batch whose files its client-entry discovery had taken in when it started. */
  seenGeneration?: number;
}

/** Re-announces a recycled builder's artifact (not an edit); the host drops it when the hashed output did not move. */
export type BuilderStateReason = "builder-recycle";

export interface CssPayload {
  cssAssets: Record<string, { cssUrl: string; cssRelPath: string }>;
  cssBase64ByUrl: Record<string, string>;
  generation?: number;
  changedFiles?: string[];
  reason?: BuilderStateReason;
}

export type DevChangeRole = "server" | "client" | "shared" | "barrel" | "config" | "css";

export type DevChangeAction =
  | "restart-backend"
  | "restart-builder"
  | "rebuild-client"
  | "rebuild-css"
  | "sync-generated"
  | "restart-dev-host"
  | "report-error";

export interface DevChangePlan {
  generation: number;
  files: string[];
  generatedFiles: string[];
  roles: DevChangeRole[];
  actions: DevChangeAction[];
  reasonByFile: Record<string, string[]>;
}

export type BuildPhase = "scan" | "barrel" | "csr" | "ssr" | "pages" | "css" | "route" | "backend";

export interface DevBuildStatus {
  generation: number;
  phase: BuildPhase;
  ok: boolean;
  files: string[];
  message?: string;
  /** The route a route build's status speaks for. */
  scope?: string;
}

export type BuilderReq = {
  type: "build-route";
  id: number;
  routeId: string;
  seeds: string[];
  graphSeeds?: string[];
  knownEntries: string[];
  generation?: number;
};

export type BuilderRes =
  | { type: "build-route-res"; id: number; ok: true; data: BuildRouteResultPayload }
  | { type: "build-route-res"; id: number; ok: false; error: string };

/** Sent by the first `/__csr` or `?csr=true` request (a device WebView in mobile dev) to arm the lazy dev CSR build. */
export type BuilderCsrReq = { type: "build-csr"; id: number; reason: string };

export type BuilderCsrRes =
  | { type: "build-csr-res"; id: number; ok: true }
  | { type: "build-csr-res"; id: number; ok: false; error: string };

/** Drain and exit (the only way bundler memory returns to the OS); draining, not killing, keeps a rebuild whole. */
export type BuilderControl = { type: "builder-shutdown"; reason: string };

/** Epoch-ms marks a save picks up on its way to the page, so a slow update says which hop it waited in. */
export interface HmrTrace {
  eventAt?: number; // first fs event of the watcher window
  flushAt?: number; // the watcher handed the batch over
  batchAt?: number; // the builder started on it (after its queue)
  spawnAt?: number; // the build worker was spawned
  workerStartAt?: number; // the worker process started
  workerAt?: number; // the worker finished its imports
  patchAt?: number; // the update (CSR patch or pages bundle) was on disk
  sentAt?: number; // the build side sent the update
  broadcastAt?: number; // the backend sent it to the tabs
}

export interface PagesBundlePayload {
  bundlePath: string;
  buildId: number;
  generation?: number;
  changedFiles?: string[];
  reason?: BuilderStateReason;
  trace?: HmrTrace;
  /** False when no changed file is one the server renders (a `"use client"` edit that kept its export names). */
  serverTouched?: boolean;
}

/** `Bun.build` keeps native arenas `Bun.gc(true)` never frees (macOS returns none when idle): hence recycling. */
export interface BuilderMetrics {
  /** A peak sampled when the queues drain; stale within seconds on Linux, so the host re-reads RSS from the OS. */
  rssBytes: number;
  /** The builder's newest generation; a replacement builder continues from the last one its host saw. */
  generation: number;
  /** Work items completed since this builder spawned, so a host can require real work before recycling. */
  workCount: number;
}

export interface CsrUpdatedPayload {
  generation: number;
  mode: "registry" | "artifact";
  reload: boolean;
  reason?: string;
  patchUrl?: string;
  changedIds?: string[];
  trace?: HmrTrace;
}

/** A new generation of the SSR dev registry, where SSR pages load their client code from: a patch, or a reload. */
export interface SsrUpdatedPayload {
  generation: number;
  reload: boolean;
  reason?: string;
  patchUrl?: string;
  changedIds?: string[];
  trace?: HmrTrace;
  /** The save also changed what the server renders: the tabs get this patch with that batch's RSC refresh. */
  hold?: boolean;
  /** The watch batch this patch came from, which the `pages-updated` releasing it names as its generation. */
  batchGeneration?: number;
  epoch?: number;
  /** The registry's first build: no tab holds a module of it, so there is nothing to send them. */
  first?: boolean;
}

export type BuilderEvent =
  // No builder sends `buildId`: readiness is the whole signal, and the build id travels with `pages-updated`.
  | { type: "builder-ready"; buildId?: string }
  | { type: "backend-ready"; pid: number }
  | {
      type: "invalidate";
      kinds: ("code" | "css" | "config")[];
      files: string[];
      generation?: number;
      devPlan?: DevChangePlan;
    }
  | { type: "css-updated"; data: CssPayload }
  | { type: "pages-updated"; data: PagesBundlePayload }
  | { type: "csr-updated"; data: CsrUpdatedPayload }
  | { type: "ssr-updated"; data: SsrUpdatedPayload }
  | { type: "build-status"; data: DevBuildStatus }
  | { type: "builder-metrics"; data: BuilderMetrics }
  /** The boot builds settled (the SSR registry's, and CSR's when the env arms it): their workers are a boot's peak. */
  | { type: "boot-armed" };

export type BuilderMessage = BuilderReq | BuilderRes | BuilderCsrReq | BuilderCsrRes | BuilderControl | BuilderEvent;

export interface ClientManifestEntry {
  id: string;
  chunks: string[];
  name: string;
  async?: boolean;
}

export type ClientManifest = Record<string, ClientManifestEntry>;

export interface BuildRouteClientResult {
  manifestDelta: ClientManifest;
  ssrManifestDelta: SsrManifest;
  newEntries: string[];
  discoveredEntries?: string[];
  clientDeps: string[];
  clientDepsByEntry?: Record<string, string[]>;
  /** The newest save batch whose files its client-entry discovery had taken in when it started. */
  seenGeneration?: number;
}

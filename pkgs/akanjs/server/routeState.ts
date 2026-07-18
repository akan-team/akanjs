import type { PathRoute } from "akanjs/client";

export const AKAN_RSC_STATE_VERSION = 1;
export const AKAN_RSC_STATE_VERSION_HEADER = "X-Akan-Rsc-State-Version";
export const AKAN_RSC_CURRENT_ROUTE_HEADER = "X-Akan-Rsc-Current-Route";
export const AKAN_RSC_CURRENT_STATE_HEADER = "X-Akan-Rsc-Current-State";
export const AKAN_RSC_RESPONSE_STATE_HEADER = "X-Akan-Rsc-State";
export const AKAN_RSC_PATCH_START_INDEX_HEADER = "X-Akan-Rsc-Patch-Start-Index";
export const AKAN_RSC_PATCH_SEGMENT_PATH_HEADER = "X-Akan-Rsc-Patch-Segment-Path";
export const AKAN_RSC_PATCH_START_SEGMENT_HEADER = "X-Akan-Rsc-Patch-Start-Segment";
export const AKAN_RSC_PATCH_HEAD_SAFE_HEADER = "X-Akan-Rsc-Patch-Head-Safe";
export const AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER = "X-Akan-Rsc-Patch-Head-Snapshot";
export const AKAN_RSC_HEAD_SNAPSHOT_VERSION = 1;
export const AKAN_RSC_HEAD_SNAPSHOT_MAX_HEADER_BYTES = 12 * 1024;

export type AkanRscPartialStatus = "full" | "candidate" | "patch" | "fallback";

export interface AkanRouteSegmentState {
  key: string;
  path: string;
  kind: "root-layout" | "layout" | "page";
}

export interface AkanRouterStateV1 {
  version: typeof AKAN_RSC_STATE_VERSION;
  buildId?: number;
  href: string;
  routeId: string;
  segments: AkanRouteSegmentState[];
}

export type AkanHeadSnapshotTag = "title" | "meta" | "link";

export interface AkanHeadSnapshotNode {
  tag: AkanHeadSnapshotTag;
  attrs?: Record<string, string>;
  text?: string;
}

export interface AkanHeadSnapshotV1 {
  version: typeof AKAN_RSC_HEAD_SNAPSHOT_VERSION;
  nodes: AkanHeadSnapshotNode[];
}

export type AkanHeadSnapshotDecodeResult =
  | { status: "ok"; snapshot: AkanHeadSnapshotV1 }
  | { status: "missing" | "invalid" | "too-large" };

export interface AkanRscPartialDecision {
  status: AkanRscPartialStatus;
  reason?: string;
  commonPrefixLength: number;
}

export interface AkanRscPatchMetadata {
  patchStartIndex: number;
  patchStartSegmentKey: string;
  segmentPath: string[];
  headSafe?: boolean;
  headSnapshot?: AkanHeadSnapshotV1;
  headSnapshotFailure?: "head-invalid" | "head-too-large";
}

export interface AkanRscPatchDecision extends AkanRscPartialDecision {
  status: "full" | "patch" | "fallback";
  patch?: AkanRscPatchMetadata;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string | null {
  try {
    const padded = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function isSegmentState(value: unknown): value is AkanRouteSegmentState {
  if (!value || typeof value !== "object") return false;
  const segment = value as Partial<AkanRouteSegmentState>;
  return (
    typeof segment.key === "string" &&
    typeof segment.path === "string" &&
    (segment.kind === "root-layout" || segment.kind === "layout" || segment.kind === "page")
  );
}

function isHeadSnapshotNode(value: unknown): value is AkanHeadSnapshotNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<AkanHeadSnapshotNode>;
  if (node.tag !== "title" && node.tag !== "meta" && node.tag !== "link") return false;
  if (node.text !== undefined && typeof node.text !== "string") return false;
  if (node.attrs !== undefined) {
    if (!node.attrs || typeof node.attrs !== "object" || Array.isArray(node.attrs)) return false;
    for (const [key, attrValue] of Object.entries(node.attrs)) {
      if (!key || typeof attrValue !== "string") return false;
    }
  }
  return true;
}

export function isAkanHeadSnapshotV1(value: unknown): value is AkanHeadSnapshotV1 {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<AkanHeadSnapshotV1>;
  return (
    snapshot.version === AKAN_RSC_HEAD_SNAPSHOT_VERSION &&
    Array.isArray(snapshot.nodes) &&
    snapshot.nodes.length <= 64 &&
    snapshot.nodes.every(isHeadSnapshotNode)
  );
}

export function isAkanRouterStateV1(value: unknown): value is AkanRouterStateV1 {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AkanRouterStateV1>;
  return (
    state.version === AKAN_RSC_STATE_VERSION &&
    (state.buildId === undefined || typeof state.buildId === "number") &&
    typeof state.href === "string" &&
    typeof state.routeId === "string" &&
    Array.isArray(state.segments) &&
    state.segments.every(isSegmentState)
  );
}

export function encodeAkanRouterState(state: AkanRouterStateV1): string {
  return encodeBase64Url(JSON.stringify(state));
}

export function encodeAkanHeadSnapshot(snapshot: AkanHeadSnapshotV1): string | null {
  const encoded = encodeBase64Url(JSON.stringify(snapshot));
  return new TextEncoder().encode(encoded).byteLength <= AKAN_RSC_HEAD_SNAPSHOT_MAX_HEADER_BYTES ? encoded : null;
}

export function decodeAkanHeadSnapshot(value: string | null | undefined): AkanHeadSnapshotDecodeResult {
  if (!value) return { status: "missing" };
  if (new TextEncoder().encode(value).byteLength > AKAN_RSC_HEAD_SNAPSHOT_MAX_HEADER_BYTES) {
    return { status: "too-large" };
  }
  const json = decodeBase64Url(value);
  if (!json) return { status: "invalid" };
  try {
    const parsed = JSON.parse(json) as unknown;
    return isAkanHeadSnapshotV1(parsed) ? { status: "ok", snapshot: parsed } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

export function readAkanHeadSnapshotResponseHeader(headers: Headers): AkanHeadSnapshotDecodeResult {
  return decodeAkanHeadSnapshot(headers.get(AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER));
}

export function decodeAkanRouterState(value: string | null | undefined): AkanRouterStateV1 | null {
  if (!value) return null;
  const json = decodeBase64Url(value);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return isAkanRouterStateV1(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function appendAkanRouterStateRequestHeaders(
  headers: Headers,
  state: AkanRouterStateV1 | null | undefined,
): void {
  if (!state) return;
  headers.set(AKAN_RSC_STATE_VERSION_HEADER, String(state.version));
  headers.set(AKAN_RSC_CURRENT_ROUTE_HEADER, state.routeId);
  headers.set(AKAN_RSC_CURRENT_STATE_HEADER, encodeAkanRouterState(state));
}

export function readAkanRouterStateResponseHeader(headers: Headers): AkanRouterStateV1 | null {
  return decodeAkanRouterState(headers.get(AKAN_RSC_RESPONSE_STATE_HEADER));
}

export function encodeAkanRscPatchSegmentPath(segmentPath: string[]): string {
  return encodeBase64Url(JSON.stringify(segmentPath));
}

export function decodeAkanRscPatchSegmentPath(value: string | null | undefined): string[] | null {
  if (!value) return null;
  const json = decodeBase64Url(value);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) && parsed.every((segment) => typeof segment === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export function readAkanRscPatchMetadataResponseHeaders(headers: Headers): AkanRscPatchMetadata | null {
  const patchStartIndexHeader = headers.get(AKAN_RSC_PATCH_START_INDEX_HEADER);
  if (patchStartIndexHeader === null) return null;
  const patchStartIndex = Number(patchStartIndexHeader);
  const patchStartSegmentKey = headers.get(AKAN_RSC_PATCH_START_SEGMENT_HEADER);
  const segmentPath = decodeAkanRscPatchSegmentPath(headers.get(AKAN_RSC_PATCH_SEGMENT_PATH_HEADER));
  if (!Number.isInteger(patchStartIndex) || patchStartIndex < 0 || !patchStartSegmentKey || !segmentPath) return null;
  if (segmentPath[patchStartIndex] !== patchStartSegmentKey) return null;
  const headSnapshotResult = readAkanHeadSnapshotResponseHeader(headers);
  return {
    patchStartIndex,
    patchStartSegmentKey,
    segmentPath,
    ...(headers.get(AKAN_RSC_PATCH_HEAD_SAFE_HEADER) === "1" ? { headSafe: true } : {}),
    ...(headSnapshotResult.status === "ok" ? { headSnapshot: headSnapshotResult.snapshot } : {}),
    ...(headSnapshotResult.status === "invalid" ? { headSnapshotFailure: "head-invalid" as const } : {}),
    ...(headSnapshotResult.status === "too-large" ? { headSnapshotFailure: "head-too-large" as const } : {}),
  };
}

export function createAkanRouterState({
  pathRoute,
  href,
  buildId,
}: {
  pathRoute: PathRoute;
  href: string;
  buildId?: number;
}): AkanRouterStateV1 {
  return {
    version: AKAN_RSC_STATE_VERSION,
    buildId,
    href,
    routeId: pathRoute.path,
    segments: createAkanRouteSegments(pathRoute),
  };
}

export function createAkanRouteSegments(pathRoute: PathRoute): AkanRouteSegmentState[] {
  const segments: AkanRouteSegmentState[] = [];
  const routePaths = pathRoute.pathSegments.length ? pathRoute.pathSegments : [pathRoute.path || "/"];
  const segmentPathAt = (index: number) => routePaths[Math.min(index, routePaths.length - 1)] ?? "/";

  for (let index = 0; index < pathRoute.renderRootLayouts.length; index++) {
    const path = segmentPathAt(index);
    segments.push({ kind: "root-layout", path, key: `root:${path}:${index}` });
  }

  for (let index = 0; index < pathRoute.renderLayouts.length; index++) {
    const stackIndex = pathRoute.renderRootLayouts.length + index;
    const path = segmentPathAt(stackIndex);
    segments.push({ kind: "layout", path, key: `layout:${path}:${stackIndex}` });
  }

  const pageIndex = pathRoute.renderRootLayouts.length + pathRoute.renderLayouts.length;
  segments.push({ kind: "page", path: pathRoute.path, key: `page:${pathRoute.path}:${pageIndex}` });
  return segments;
}

export function createAkanSegmentOutletKey(segmentPath: string[], segmentIndex: number): string | null {
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0) return null;
  const parentKey = segmentPath[segmentIndex - 1] ?? "root";
  return `slot:${parentKey}:${segmentIndex}`;
}

export function readAkanRouterStateRequest(headers: Headers): {
  state: AkanRouterStateV1 | null;
  currentRoute?: string;
  reason?: string;
} {
  const encoded = headers.get(AKAN_RSC_CURRENT_STATE_HEADER);
  if (!encoded) return { state: null, reason: "missing-state" };

  const version = headers.get(AKAN_RSC_STATE_VERSION_HEADER);
  if (version !== String(AKAN_RSC_STATE_VERSION)) return { state: null, reason: "version-mismatch" };

  const state = decodeAkanRouterState(encoded);
  if (!state) return { state: null, reason: "invalid-state" };

  return { state, currentRoute: headers.get(AKAN_RSC_CURRENT_ROUTE_HEADER) ?? undefined };
}

export function resolveAkanRscPartialDecision({
  currentState,
  currentRoute,
  targetState,
}: {
  currentState: AkanRouterStateV1 | null;
  currentRoute?: string;
  targetState: AkanRouterStateV1;
}): AkanRscPartialDecision {
  if (!currentState) return { status: "full", reason: "missing-state", commonPrefixLength: 0 };
  if (currentRoute && currentRoute !== currentState.routeId) {
    return { status: "fallback", reason: "current-route-mismatch", commonPrefixLength: 0 };
  }
  if (
    currentState.buildId !== undefined &&
    targetState.buildId !== undefined &&
    currentState.buildId !== targetState.buildId
  ) {
    return { status: "fallback", reason: "build-mismatch", commonPrefixLength: 0 };
  }

  const commonPrefixLength = countCommonRouteSegments(currentState.segments, targetState.segments);
  if (commonPrefixLength === 0) return { status: "full", reason: "root-mismatch", commonPrefixLength };
  if (currentState.href === targetState.href && currentState.routeId === targetState.routeId) {
    return { status: "full", reason: "same-route", commonPrefixLength };
  }
  return { status: "candidate", reason: "common-prefix", commonPrefixLength };
}

export function resolveAkanRscPatchDecision({
  currentState,
  targetState,
  partialDecision,
}: {
  currentState: AkanRouterStateV1 | null;
  targetState: AkanRouterStateV1;
  partialDecision: AkanRscPartialDecision;
}): AkanRscPatchDecision {
  if (partialDecision.status === "fallback") return { ...partialDecision, status: "fallback" };
  if (partialDecision.status !== "candidate" || !currentState) {
    return { status: "full", reason: partialDecision.reason, commonPrefixLength: partialDecision.commonPrefixLength };
  }
  if (currentState.routeId === targetState.routeId) {
    const patchStartIndex = targetState.segments.length - 1;
    const targetPageSegment = targetState.segments[patchStartIndex];
    if (targetPageSegment?.kind !== "page") {
      return { status: "full", reason: "unsupported-suffix", commonPrefixLength: partialDecision.commonPrefixLength };
    }
    return {
      status: "patch",
      reason: "same-route-search-params",
      commonPrefixLength: partialDecision.commonPrefixLength,
      patch: {
        patchStartIndex,
        patchStartSegmentKey: targetPageSegment.key,
        segmentPath: targetState.segments.map((segment) => segment.key),
      },
    };
  }

  const patchStartIndex = partialDecision.commonPrefixLength;
  const targetSuffix = targetState.segments.slice(patchStartIndex);
  if (targetSuffix.length !== 1 || targetSuffix[0]?.kind !== "page") {
    return { status: "full", reason: "unsupported-suffix", commonPrefixLength: partialDecision.commonPrefixLength };
  }

  const patchStartSegmentKey = targetSuffix[0].key;
  return {
    status: "patch",
    reason: "sibling-page",
    commonPrefixLength: partialDecision.commonPrefixLength,
    patch: {
      patchStartIndex,
      patchStartSegmentKey,
      segmentPath: targetState.segments.slice(0, patchStartIndex + 1).map((segment) => segment.key),
    },
  };
}

export function countCommonRouteSegments(
  currentSegments: AkanRouteSegmentState[],
  targetSegments: AkanRouteSegmentState[],
): number {
  const length = Math.min(currentSegments.length, targetSegments.length);
  for (let index = 0; index < length; index++) {
    if (currentSegments[index]?.key !== targetSegments[index]?.key) return index;
  }
  return length;
}

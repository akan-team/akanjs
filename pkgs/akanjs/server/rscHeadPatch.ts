import { hasRscRouteHead, type RscRoutePatch, readRscRoutePatch, writeRscRoutePatch } from "../client/rscNavigation";
import type { AkanHeadSnapshotV1 } from "./routeState";
import type { AkanSegmentPatchFailureReason } from "./rscNavigationState";

export interface PreparedAkanHeadSnapshotPatch {
  previous: RscRoutePatch | null;
  next: RscRoutePatch;
}

export function getAkanHeadSnapshotPatchFailureReason(
  snapshot: AkanHeadSnapshotV1,
): Extract<AkanSegmentPatchFailureReason, "head-missing" | "head-invalid"> | null {
  if (!Array.isArray(snapshot.nodes)) return "head-invalid";
  if (!hasRscRouteHead()) return "head-missing";
  return null;
}

export function canApplyAkanHeadSnapshotPatch(snapshot: AkanHeadSnapshotV1): boolean {
  return getAkanHeadSnapshotPatchFailureReason(snapshot) === null;
}

export function prepareAkanHeadSnapshotPatch(
  snapshot: AkanHeadSnapshotV1,
  href: string,
): PreparedAkanHeadSnapshotPatch | null {
  if (getAkanHeadSnapshotPatchFailureReason(snapshot)) return null;
  return { previous: readRscRoutePatch(), next: { href, head: snapshot } };
}

export function commitPreparedAkanHeadSnapshotPatch(prepared: PreparedAkanHeadSnapshotPatch): boolean {
  if (!hasRscRouteHead()) return false;
  writeRscRoutePatch(prepared.next);
  return true;
}

export function rollbackPreparedAkanHeadSnapshotPatch(prepared: PreparedAkanHeadSnapshotPatch): void {
  writeRscRoutePatch(prepared.previous);
}

export function applyAkanHeadSnapshotPatch(snapshot: AkanHeadSnapshotV1, href: string): boolean {
  const prepared = prepareAkanHeadSnapshotPatch(snapshot, href);
  return prepared ? commitPreparedAkanHeadSnapshotPatch(prepared) : false;
}

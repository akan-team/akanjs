import type { PageConfig } from "akanjs/client";
import {
  type AkanHeadSnapshotV1,
  type AkanRscPatchDecision,
  encodeAkanHeadSnapshot,
  isAkanHeadSnapshotV1,
} from "./routeState";

export function resolveAkanRscHeadSafePatchDecision({
  partialCommitEnabled,
  patchDecision,
  pageConfig,
  headSnapshot,
}: {
  partialCommitEnabled: boolean;
  patchDecision: AkanRscPatchDecision;
  pageConfig?: PageConfig;
  headSnapshot?: AkanHeadSnapshotV1;
}): AkanRscPatchDecision {
  if (!partialCommitEnabled || patchDecision.status !== "patch" || !patchDecision.patch) return patchDecision;
  if (pageConfig?.rscPatchHeadSafe !== true) {
    return {
      status: "full",
      reason: "head-unsafe",
      commonPrefixLength: patchDecision.commonPrefixLength,
    };
  }
  if (!headSnapshot) {
    return {
      status: "full",
      reason: "head-missing",
      commonPrefixLength: patchDecision.commonPrefixLength,
    };
  }
  if (!isAkanHeadSnapshotV1(headSnapshot)) {
    return {
      status: "full",
      reason: "head-invalid",
      commonPrefixLength: patchDecision.commonPrefixLength,
    };
  }
  if (!encodeAkanHeadSnapshot(headSnapshot)) {
    return {
      status: "full",
      reason: "head-too-large",
      commonPrefixLength: patchDecision.commonPrefixLength,
    };
  }
  return {
    ...patchDecision,
    patch: {
      ...patchDecision.patch,
      headSafe: true,
      headSnapshot,
    },
  };
}

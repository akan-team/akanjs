import { type ReactNode, startTransition } from "react";
import { AkanError } from "../base/akanError";
import { type FlightLineRowHandler, type FlightRowPass, flightRowPassOf } from "./flightRowReader";
import { type AkanHeadSnapshotV1, type AkanRscPatchMetadata, readAkanRouterStateResponseHeader } from "./routeState";
import {
  commitPreparedAkanHeadSnapshotPatch,
  prepareAkanHeadSnapshotPatch,
  rollbackPreparedAkanHeadSnapshotPatch,
} from "./rscHeadPatch";
import { getRscPayloadStream } from "./rscHttp";
import {
  type AkanSegmentCacheNode,
  type AkanSegmentPatchFailureReason,
  type AkanSegmentPatchResult,
  applyAkanSegmentCachePatch,
} from "./rscNavigationState";
import { commitAkanSegmentOutletPatch, hasAkanSegmentOutlet, resetAkanSegmentOutletPatches } from "./rscSegmentOutlet";

const RSC_PATCH_REDIRECT_ROW_RE = /^[0-9a-z]+:E\{[^\n]*"digest":"AKAN_REDIRECT(?:;[^"]*)?"[^\n]*\}\n?$/;
const RSC_PATCH_ERROR_ROW_RE = /^[0-9a-z]+:E\{[^\n]*\}\n?$/;
const patchesWithControlRows = new WeakSet<PromiseLike<unknown>>();

export interface RscPatchedResult<T> {
  type: "patched";
  tree: AkanSegmentCacheNode<T>;
  patchedNode: AkanSegmentCacheNode<T>;
  patch: AkanRscPatchMetadata;
  outletKey: string;
  headSnapshot: AkanHeadSnapshotV1;
}

interface ValidateRscSegmentPatchInput<T extends PromiseLike<unknown>> {
  href: string;
  response: Response;
  patch: AkanRscPatchMetadata;
  currentTree: AkanSegmentCacheNode<T> | null;
  createThenable: (rows: FlightRowPass) => T;
  navId?: number;
  getCurrentNavId?: () => number;
  getHeadSnapshotPatchFailureReason?: (snapshot: AkanHeadSnapshotV1) => AkanSegmentPatchFailureReason | null;
}

function patchControlRowGuard(
  onControl: (reason: Extract<AkanSegmentPatchFailureReason, "redirect-in-patch" | "error-in-patch">) => void,
): FlightLineRowHandler {
  const decoder = new TextDecoder("utf-8", { fatal: true });

  const inspectRow = (row: Uint8Array): void => {
    try {
      const text = decoder.decode(row);
      if (RSC_PATCH_REDIRECT_ROW_RE.test(text)) onControl("redirect-in-patch");
      else if (RSC_PATCH_ERROR_ROW_RE.test(text)) onControl("error-in-patch");
    } catch {
      // The Flight decoder reports malformed rows as decode failures.
    }
  };

  return (row, tag) => {
    if (tag === "E") inspectRow(row);
    return row;
  };
}

export async function validateRscPatchAndRequestFullFallback<T extends PromiseLike<unknown>>(
  input: ValidateRscSegmentPatchInput<T>,
): Promise<{ sendRouterState: false; patchResult: AkanSegmentPatchResult<T> }> {
  return { sendRouterState: false, patchResult: await validateRscSegmentPatch(input) };
}

export async function validateRscSegmentPatch<T extends PromiseLike<unknown>>({
  href,
  response,
  patch,
  currentTree,
  createThenable,
  navId,
  getCurrentNavId,
}: ValidateRscSegmentPatchInput<T>): Promise<AkanSegmentPatchResult<T>> {
  const patchStream = getRscPayloadStream(response);
  let patchControlReason: Extract<AkanSegmentPatchFailureReason, "redirect-in-patch" | "error-in-patch"> | undefined;
  const patchThenable = patchStream
    ? createThenable(
        flightRowPassOf(
          patchStream,
          patchControlRowGuard((reason) => {
            patchControlReason ??= reason;
            if (patchThenable) patchesWithControlRows.add(patchThenable);
          }),
        ),
      )
    : undefined;
  let decodeFailed = !patchThenable;

  if (patchThenable) {
    try {
      await patchThenable;
      //? RSDW resolves on the root row; the chunks after it that have already arrived are read before the next task.
      await new Promise((resolve) => setTimeout(resolve));
    } catch {
      decodeFailed = true;
    }
  }

  if (patchControlReason) return { status: "rejected", reason: patchControlReason };

  return applyAkanSegmentCachePatch({
    currentTree,
    targetRouterState: readAkanRouterStateResponseHeader(response.headers),
    patch,
    href,
    thenable: patchThenable,
    navId,
    getCurrentNavId,
    decodeFailed,
  });
}

export async function validateRscPatchForGuardedCommit<T extends PromiseLike<unknown>>({
  partialCommitEnabled,
  ...input
}: ValidateRscSegmentPatchInput<T> & {
  partialCommitEnabled: boolean;
}): Promise<AkanSegmentPatchResult<T>> {
  const patchResult = await validateRscSegmentPatch(input);
  if (patchResult.status === "rejected" && patchResult.reason !== "missing-current-tree") return patchResult;
  if (!partialCommitEnabled) return { status: "rejected", reason: "guard-disabled" };
  if (input.patch.headSafe !== true) return { status: "rejected", reason: "head-unsafe" };
  if (input.patch.headSnapshotFailure) return { status: "rejected", reason: input.patch.headSnapshotFailure };
  if (!input.patch.headSnapshot) return { status: "rejected", reason: "head-missing" };
  const headPatchFailureReason = input.getHeadSnapshotPatchFailureReason?.(input.patch.headSnapshot);
  if (headPatchFailureReason) return { status: "rejected", reason: headPatchFailureReason };
  if (patchResult.status === "rejected") return patchResult;
  if (!patchResult.patchedNode.thenable) return { status: "rejected", reason: "decode-error" };
  if (!hasAkanSegmentOutlet(patchResult.outletKey)) return { status: "rejected", reason: "outlet-missing" };
  return { ...patchResult, headSnapshot: input.patch.headSnapshot };
}

export function commitRscPatch<T extends PromiseLike<ReactNode>>(
  target: string,
  patch: RscPatchedResult<T>,
  onCommitted: () => void,
): boolean {
  const patchThenable = patch.patchedNode.thenable;
  if (!patchThenable)
    throw new AkanError("invalidRscResponse", "[rscClient] validated RSC patch is missing a thenable");
  if (patchesWithControlRows.has(patchThenable)) return false;
  const preparedHeadPatch = prepareAkanHeadSnapshotPatch(patch.headSnapshot, target);
  if (!preparedHeadPatch) return false;

  let outletCommitted = false;
  let headApplied = false;
  startTransition(() => {
    try {
      headApplied = commitPreparedAkanHeadSnapshotPatch(preparedHeadPatch);
      if (!headApplied) return;
      outletCommitted = commitAkanSegmentOutletPatch(patch.outletKey, patchThenable);
      if (!outletCommitted) {
        rollbackPreparedAkanHeadSnapshotPatch(preparedHeadPatch);
        return;
      }
      onCommitted();
    } catch {
      if (headApplied) rollbackPreparedAkanHeadSnapshotPatch(preparedHeadPatch);
      if (outletCommitted) resetAkanSegmentOutletPatches();
      headApplied = false;
      outletCommitted = false;
    }
  });
  return outletCommitted && headApplied;
}

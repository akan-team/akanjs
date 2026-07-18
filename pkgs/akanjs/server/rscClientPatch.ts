import { type AkanHeadSnapshotV1, type AkanRscPatchMetadata, readAkanRouterStateResponseHeader } from "./routeState";
import { getRscPayloadStream } from "./rscHttp";
import {
  type AkanSegmentCacheNode,
  type AkanSegmentPatchFailureReason,
  type AkanSegmentPatchResult,
  applyAkanSegmentCachePatch,
} from "./rscNavigationState";
import { hasAkanSegmentOutlet } from "./rscSegmentOutlet";

const RSC_PATCH_REDIRECT_ROW_RE = /^[0-9a-z]+:E\{[^\n]*"digest":"AKAN_REDIRECT(?:;[^"]*)?"[^\n]*\}\n?$/;
const RSC_PATCH_ERROR_ROW_RE = /^[0-9a-z]+:E\{[^\n]*\}\n?$/;

interface ValidateRscSegmentPatchInput<T extends PromiseLike<unknown>> {
  href: string;
  response: Response;
  patch: AkanRscPatchMetadata;
  currentTree: AkanSegmentCacheNode<T> | null;
  createThenable: (stream: ReadableStream<Uint8Array>) => T;
  navId?: number;
  getCurrentNavId?: () => number;
  getHeadSnapshotPatchFailureReason?: (snapshot: AkanHeadSnapshotV1) => AkanSegmentPatchFailureReason | null;
}

function guardRscPatchControlRows(
  stream: ReadableStream<Uint8Array>,
  onControl: (reason: Extract<AkanSegmentPatchFailureReason, "redirect-in-patch" | "error-in-patch">) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffered = new Uint8Array(new ArrayBuffer(0));

  const concat = (left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> => {
    const combined = new Uint8Array(new ArrayBuffer(left.byteLength + right.byteLength));
    combined.set(left, 0);
    combined.set(right, left.byteLength);
    return combined;
  };
  const inspectRow = (row: Uint8Array): void => {
    try {
      const text = decoder.decode(row);
      if (RSC_PATCH_REDIRECT_ROW_RE.test(text)) onControl("redirect-in-patch");
      else if (RSC_PATCH_ERROR_ROW_RE.test(text)) onControl("error-in-patch");
    } catch {
      // The Flight decoder reports malformed rows as decode failures.
    }
  };

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffered = concat(buffered, chunk);
        let rowStart = 0;
        for (let index = 0; index < buffered.byteLength; index += 1) {
          if (buffered[index] !== 10) continue;
          const row = buffered.slice(rowStart, index + 1);
          inspectRow(row);
          controller.enqueue(row);
          rowStart = index + 1;
        }
        buffered = rowStart === 0 ? buffered : buffered.slice(rowStart);
      },
      flush(controller) {
        if (buffered.byteLength === 0) return;
        inspectRow(buffered);
        controller.enqueue(buffered);
        buffered = new Uint8Array(new ArrayBuffer(0));
      },
    }),
  );
}

export async function validateRscPatchAndRequestFullFallback<T extends PromiseLike<unknown>>({
  href,
  response,
  patch,
  currentTree,
  createThenable,
  navId,
  getCurrentNavId,
}: ValidateRscSegmentPatchInput<T>): Promise<{
  sendRouterState: false;
  patchResult: AkanSegmentPatchResult<T>;
}> {
  const patchResult = await validateRscSegmentPatch({
    href,
    response,
    patch,
    currentTree,
    createThenable,
    navId,
    getCurrentNavId,
  });
  return {
    sendRouterState: false,
    patchResult,
  };
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
  const guardedPatchStream = patchStream
    ? guardRscPatchControlRows(patchStream, (reason) => {
        patchControlReason ??= reason;
      })
    : null;
  const patchThenable = guardedPatchStream ? createThenable(guardedPatchStream) : undefined;
  let decodeFailed = !patchThenable;

  if (patchThenable) {
    try {
      await patchThenable;
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

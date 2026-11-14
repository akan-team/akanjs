import { AkanError } from "akanjs/base";
import type { AkanTheme } from "akanjs/fetch";
import type { RouteCacheRenderState } from "./cachePolicy";
import type { RscWorkerErrorCode } from "./rscWorkerProcess";
import type { RscTraceMetadata, SsrLateControl } from "./ssrTypes";

// A bounded queue guard, not backpressure: a host that cannot drain IPC chunks fails the render instead of buffering.
const DEFAULT_RSC_HOST_MAX_PENDING_CHUNKS = 256;

export interface RscPending {
  onChunk: (data: Uint8Array) => void;
  onEnd: () => void;
  onError: (message: string, code?: RscWorkerErrorCode) => void;
  onMeta?: (meta: { theme?: AkanTheme; status?: number; trace?: RscTraceMetadata }) => void;
  onTheme?: (theme: AkanTheme | undefined) => void;
  onCacheState?: (state: RouteCacheRenderState) => void;
  onRedirect?: (location: string, method: RscRedirectMethod, status: RscRedirectStatus) => void;
  onLateRedirect?: (location: string, method: RscRedirectMethod, status: RscRedirectStatus) => void;
  onLateNotFound?: () => void;
  onNotFound?: () => void;
}

export type RscRedirectMethod = "replace" | "push";
export type RscRedirectStatus = 303 | 307 | 308;

export type RscRenderResult =
  | {
      type: "stream";
      stream: ReadableStream<Uint8Array>;
      theme?: AkanTheme;
      status?: number;
      trace?: RscTraceMetadata;
      lateControl: Promise<SsrLateControl | null>;
      cacheState: Promise<RouteCacheRenderState>;
      cancel: (reason?: unknown) => void;
    }
  | { type: "redirect"; location: string; method: RscRedirectMethod; status: RscRedirectStatus }
  | { type: "not-found" };

export interface RscHostRenderStreamInput {
  setPending: (pending: RscPending) => void;
  deletePending: () => void;
  sendRenderOrQueue: () => void;
  cancelRender: (reason?: unknown) => void;
  maxPendingChunks?: number;
  signal?: AbortSignal;
  onPendingChunkOverflow?: () => void;
}

interface RscHostRenderState {
  settled: boolean;
  theme?: AkanTheme;
  status?: number;
  trace?: RscTraceMetadata;
  pendingChunks: number;
}

interface RscRenderLateSettlers {
  lateControl: Promise<SsrLateControl | null>;
  cacheState: Promise<RouteCacheRenderState>;
  settleLateControl: (control: SsrLateControl | null) => void;
  settleCacheState: (state: RouteCacheRenderState) => void;
}

interface RscHostPendingParts {
  input: RscHostRenderStreamInput;
  render: RscHostRenderState;
  controller: ReadableStreamDefaultController<Uint8Array>;
  maxPendingChunks: number;
  settleStream: () => void;
  settleLateControl: (control: SsrLateControl | null) => void;
  settleCacheState: (state: RouteCacheRenderState) => void;
  cleanupAbortListener: () => void;
  cancelRender: (reason?: unknown) => void;
  resolve: (result: RscRenderResult) => void;
  reject: (error: Error) => void;
}

export function getRscHostMaxPendingChunks(value = process.env.AKAN_RSC_HOST_MAX_PENDING_CHUNKS): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RSC_HOST_MAX_PENDING_CHUNKS;
}

export function nextRscHostPendingChunkCount(currentPendingChunks: number, desiredSize: number | null): number {
  return desiredSize !== null && desiredSize <= 0 ? currentPendingChunks + 1 : 0;
}

export function isRscHostPendingChunkOverflow(pendingChunks: number, maxPendingChunks: number): boolean {
  return pendingChunks > maxPendingChunks;
}

function createRscRenderAbortError(reason?: unknown): Error {
  if (reason instanceof Error) return reason;
  const error = new AkanError("renderAborted", reason === undefined ? "rsc render aborted" : String(reason), {
    statusCode: 499,
  });
  error.name = "AbortError";
  return error;
}

export function createIdempotentRscRenderCancel(onCancel: (reason?: unknown) => void): (reason?: unknown) => void {
  let cancelled = false;
  return (reason?: unknown) => {
    if (cancelled) return;
    cancelled = true;
    onCancel(reason);
  };
}

function createRscRenderLateSettlers(): RscRenderLateSettlers {
  let resolveLateControl!: (control: SsrLateControl | null) => void;
  let resolveCacheState!: (state: RouteCacheRenderState) => void;
  const lateControl = new Promise<SsrLateControl | null>((resolve) => {
    resolveLateControl = resolve;
  });
  const cacheState = new Promise<RouteCacheRenderState>((resolve) => {
    resolveCacheState = resolve;
  });
  let lateControlSettled = false;
  let cacheStateSettled = false;
  const settleLateControl = (control: SsrLateControl | null) => {
    if (lateControlSettled) return;
    lateControlSettled = true;
    resolveLateControl(control);
  };
  const settleCacheState = (state: RouteCacheRenderState) => {
    if (cacheStateSettled) return;
    cacheStateSettled = true;
    resolveCacheState(state);
  };
  return { lateControl, cacheState, settleLateControl, settleCacheState };
}

function createRscHostPending({
  input,
  render,
  controller,
  maxPendingChunks,
  settleStream,
  settleLateControl,
  settleCacheState,
  cleanupAbortListener,
  cancelRender,
  resolve,
  reject,
}: RscHostPendingParts): RscPending {
  return {
    onMeta: (meta) => {
      render.theme = meta.theme;
      render.status = meta.status;
      render.trace = meta.trace;
      settleStream();
    },
    onTheme: (next) => {
      render.theme = next;
    },
    onChunk: (data) => {
      settleStream();
      render.pendingChunks = nextRscHostPendingChunkCount(render.pendingChunks, controller.desiredSize);
      if (isRscHostPendingChunkOverflow(render.pendingChunks, maxPendingChunks)) {
        const error = new AkanError(
          "rscQueueOverflow",
          `rsc worker host queue exceeded ${maxPendingChunks} pending chunks`,
        );
        input.onPendingChunkOverflow?.();
        cancelRender(error);
        controller.error(error);
        return;
      }
      controller.enqueue(data);
    },
    onEnd: () => {
      settleLateControl(null);
      settleCacheState({ cacheable: false, reason: "missing-cache-state" });
      cleanupAbortListener();
      settleStream();
      controller.close();
    },
    onError: (msg, code = "rscWorkerFailed") => {
      settleLateControl(null);
      settleCacheState({ cacheable: false, reason: "error" });
      cleanupAbortListener();
      if (!render.settled) {
        render.settled = true;
        reject(new AkanError(code, msg));
        return;
      }
      controller.error(new AkanError(code, msg));
    },
    onRedirect: (location, method, status) => {
      settleLateControl(null);
      settleCacheState({ cacheable: false, reason: "redirect" });
      cleanupAbortListener();
      if (!render.settled) {
        render.settled = true;
        resolve({ type: "redirect", location, method, status });
        controller.close();
        return;
      }
      controller.error(new AkanError("invalidRscResponse", `redirect after stream started: ${location}`));
    },
    onLateRedirect: (location, method, status) => settleLateControl({ type: "redirect", location, method, status }),
    onLateNotFound: () => settleLateControl({ type: "not-found" }),
    onCacheState: settleCacheState,
    onNotFound: () => {
      settleLateControl(null);
      settleCacheState({ cacheable: false, reason: "not-found" });
      cleanupAbortListener();
      if (!render.settled) {
        render.settled = true;
        resolve({ type: "not-found" });
        controller.close();
        return;
      }
      controller.error(new AkanError("invalidRscResponse", "not-found after stream started"));
    },
  };
}

export function createRscHostRenderStream(input: RscHostRenderStreamInput): Promise<RscRenderResult> {
  const render: RscHostRenderState = { settled: false, pendingChunks: 0 };
  let stream!: ReadableStream<Uint8Array>;
  const { lateControl, cacheState, settleLateControl, settleCacheState } = createRscRenderLateSettlers();
  const maxPendingChunks = input.maxPendingChunks ?? getRscHostMaxPendingChunks();
  let removeAbortListener: (() => void) | undefined;
  const cleanupAbortListener = () => {
    removeAbortListener?.();
    removeAbortListener = undefined;
  };
  const cancelRender = createIdempotentRscRenderCancel((reason) => {
    input.deletePending();
    settleLateControl(null);
    settleCacheState({ cacheable: false, reason: "cancelled" });
    input.cancelRender(reason);
    cleanupAbortListener();
  });

  return new Promise<RscRenderResult>((resolve, reject) => {
    stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const abortRender = () => {
          const error = createRscRenderAbortError(input.signal?.reason);
          cancelRender(error);
          if (!render.settled) {
            render.settled = true;
            reject(error);
            return;
          }
          controller.error(error);
        };
        const settleStream = () => {
          if (render.settled) return;
          render.settled = true;
          resolve({
            type: "stream",
            stream,
            get theme() {
              return render.theme;
            },
            status: render.status,
            trace: render.trace,
            lateControl,
            cacheState,
            cancel: cancelRender,
          });
        };
        input.setPending(
          createRscHostPending({
            input,
            render,
            controller,
            maxPendingChunks,
            settleStream,
            settleLateControl,
            settleCacheState,
            cleanupAbortListener,
            cancelRender,
            resolve,
            reject,
          }),
        );
        if (input.signal) {
          if (input.signal.aborted) {
            abortRender();
            return;
          }
          input.signal.addEventListener("abort", abortRender, { once: true });
          removeAbortListener = () => input.signal?.removeEventListener("abort", abortRender);
        }
        input.sendRenderOrQueue();
      },
      cancel: cancelRender,
      pull: () => {
        render.pendingChunks = Math.max(0, render.pendingChunks - 1);
      },
    });
  });
}

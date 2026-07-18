import type { RouteCacheRenderState } from "./cachePolicy";
import type { RscTraceMetadata } from "./ssrTypes";

export type CachedRscReplayMessage =
  | { type: "meta"; requestId: string; theme?: string; status?: number; trace?: RscTraceMetadata }
  | { type: "cache-state"; requestId: string; state: RouteCacheRenderState }
  | { type: "chunk"; requestId: string; data: Uint8Array }
  | { type: "end"; requestId: string };

function yieldToHostEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function replayCachedRscResult(input: {
  requestId: string;
  chunks: readonly Uint8Array[];
  theme?: string;
  status?: number;
  trace?: RscTraceMetadata;
  cacheState?: RouteCacheRenderState;
  send: (message: CachedRscReplayMessage) => void;
  isCancelled: () => boolean;
  yieldEveryChunks?: number;
  yieldToHost?: () => Promise<void>;
}): Promise<boolean> {
  const yieldEveryChunks =
    input.yieldEveryChunks !== undefined && Number.isFinite(input.yieldEveryChunks) && input.yieldEveryChunks > 0
      ? Math.floor(input.yieldEveryChunks)
      : 1;
  const yieldToHost = input.yieldToHost ?? yieldToHostEventLoop;
  if (input.isCancelled()) return false;
  const metaMessage: CachedRscReplayMessage = {
    type: "meta",
    requestId: input.requestId,
    theme: input.theme,
    status: input.status,
  };
  if (input.trace) metaMessage.trace = input.trace;
  input.send(metaMessage);
  input.send({ type: "cache-state", requestId: input.requestId, state: input.cacheState ?? { cacheable: true } });
  for (let index = 0; index < input.chunks.length; index += 1) {
    if (input.isCancelled()) return false;
    input.send({ type: "chunk", requestId: input.requestId, data: input.chunks[index] });
    if ((index + 1) % yieldEveryChunks === 0) await yieldToHost();
  }
  if (input.isCancelled()) return false;
  input.send({ type: "end", requestId: input.requestId });
  return true;
}

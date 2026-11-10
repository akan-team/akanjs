type InlineRscChunk = [1, string] | [3, string];

declare global {
  var __RSC_CHUNKS__: InlineRscChunk[] | undefined;
  var __RSC_CLOSED__: boolean | undefined;
  var __RSC_PUSH__: ((type: InlineRscChunk[0], data: string) => void) | undefined;
  var __RSC_CLOSE__: (() => void) | undefined;
}

function decodeInlineRscChunk([type, data]: InlineRscChunk): Uint8Array {
  if (type === 1) return new TextEncoder().encode(data);
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function createInitialRscStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const queued = globalThis.__RSC_CHUNKS__ ?? [];
      for (const chunk of queued) controller.enqueue(decodeInlineRscChunk(chunk));
      globalThis.__RSC_CHUNKS__ = [];

      if (globalThis.__RSC_CLOSED__) {
        controller.close();
        return;
      }

      globalThis.__RSC_PUSH__ = (type, data) => controller.enqueue(decodeInlineRscChunk([type, data]));
      globalThis.__RSC_CLOSE__ = () => controller.close();
    },
  });
}

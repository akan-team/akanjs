export const ensureReadableStreamReady = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const first = await reader.read().catch((error: unknown) => {
    reader.releaseLock();
    throw error;
  });
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        if (first.done) controller.close();
        else controller.enqueue(first.value);
      },
      async pull(controller) {
        const next = await reader.read();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      async cancel(reason) {
        await reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
};

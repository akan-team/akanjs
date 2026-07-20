export async function ensureReadableStreamReady(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  let released = false;
  const release = () => {
    if (released) return;
    reader.releaseLock();
    released = true;
  };
  try {
    const first = await reader.read();
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (!first.done) controller.enqueue(first.value);
          let isDone = false;
          while (!isDone) {
            const next = await reader.read();
            isDone = next.done;
            if (!next.done) controller.enqueue(next.value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          release();
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          release();
        }
      },
    });
  } catch (error) {
    release();
    throw error;
  }
}

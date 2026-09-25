export async function writeReadableStreamToFile(localPath: string, readStream: ReadableStream) {
  const reader = readStream.getReader();
  const writer = Bun.file(localPath).writer();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(value);
    }
  } finally {
    reader.releaseLock();
    await writer.end();
  }
}

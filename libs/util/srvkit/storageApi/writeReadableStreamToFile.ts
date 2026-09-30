import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Err } from "../../lib/dict";

export interface WriteReadableStreamOptions {
  /** 누적 수신 바이트가 늘어날 때마다 호출된다 */
  onChunk?: (loaded: number) => void;
  /** 전송을 중간에 끊기 위한 신호 */
  signal?: AbortSignal;
  /** 마지막 수신 이후 이 시간(ms) 동안 한 바이트도 안 오면 끊긴 것으로 본다. 0 이면 감시하지 않는다 */
  stallTimeout?: number;
}

/** @returns 파일에 쓴 총 바이트 */
export async function writeReadableStreamToFile(
  localPath: string,
  readStream: ReadableStream,
  { onChunk, signal, stallTimeout = 0 }: WriteReadableStreamOptions = {},
) {
  //? Unlike Bun.write, a FileSink does not create the folders on its way: a fresh data folder has none.
  await mkdir(dirname(localPath), { recursive: true });
  const reader = readStream.getReader();
  const writer = Bun.file(localPath).writer();
  let loaded = 0;
  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  // 무응답 감시는 청크마다 다시 걸어야 한다. 총 소요시간에 상한을 두면 느린 회선에서 정상 전송까지 죽는다
  const restartStallTimer = () => {
    if (!stallTimeout) return;
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      void reader.cancel();
    }, stallTimeout);
  };
  // cancel 은 대기 중인 read 를 done 으로 풀어주므로, 멈춘 스트림에 매달리지 않고 루프를 빠져나온다
  const onAbort = () => void reader.cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) throw new Err("util.error.streamAborted", { localPath });
    restartStallTimer();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(value);
      loaded += value.length;
      restartStallTimer();
      onChunk?.(loaded);
    }
    if (stalled)
      throw new Err("util.error.streamStalled", { localPath, seconds: Math.round(stallTimeout / 1000).toString() });
    if (signal?.aborted) throw new Err("util.error.streamAborted", { localPath });
  } finally {
    clearTimeout(stallTimer);
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
    await writer.end();
  }
  return loaded;
}

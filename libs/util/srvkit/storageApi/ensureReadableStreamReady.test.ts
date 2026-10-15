import { describe, expect, test } from "bun:test";
import { ensureReadableStreamReady } from "./ensureReadableStreamReady";

const countingSource = (chunkNum: number, onCancel?: (reason: unknown) => void) => {
  const state = { pulled: 0 };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulled += 1;
        if (state.pulled > chunkNum) controller.close();
        else controller.enqueue(new Uint8Array([state.pulled]));
      },
      cancel: onCancel,
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
};

const readAll = async (stream: ReadableStream<Uint8Array>) => {
  const values: number[] = [];
  for await (const chunk of stream) values.push(...chunk);
  return values;
};

describe("ensureReadableStreamReady", () => {
  test("reads only the first chunk ahead of the consumer", async () => {
    const { stream, state } = countingSource(200);
    const reader = (await ensureReadableStreamReady(stream)).getReader();
    await reader.read();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state.pulled).toBeLessThanOrEqual(2);
    await reader.cancel();
  });

  test("delivers every chunk in order", async () => {
    const { stream } = countingSource(5);
    expect(await readAll(await ensureReadableStreamReady(stream))).toEqual([1, 2, 3, 4, 5]);
  });

  test("delivers an empty source as an empty stream", async () => {
    const { stream } = countingSource(0);
    expect(await readAll(await ensureReadableStreamReady(stream))).toEqual([]);
  });

  test("forwards a cancel to the source after the consumer has read part of it", async () => {
    const reasons: unknown[] = [];
    const { stream } = countingSource(200, (reason) => {
      reasons.push(reason);
    });
    const reader = (await ensureReadableStreamReady(stream)).getReader();
    await reader.read();
    await reader.read();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await reader.cancel("client gone");
    expect(reasons).toEqual(["client gone"]);
  });

  test("resolves a cancel after the whole source was read", async () => {
    const { stream } = countingSource(3);
    const reader = (await ensureReadableStreamReady(stream)).getReader();
    while (!(await reader.read()).done);
    await reader.cancel();
  });

  test("rejects before handing out a stream whose source fails on the first read", async () => {
    const failing = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("ENOENT");
      },
    });
    await expect(ensureReadableStreamReady(failing)).rejects.toThrow("ENOENT");
    expect(failing.locked).toBe(false);
  });

  test("errors the stream when the source fails mid-way", async () => {
    let pulled = 0;
    const flaky = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled += 1;
          if (pulled > 1) throw new Error("connection reset");
          controller.enqueue(new Uint8Array([pulled]));
        },
      },
      { highWaterMark: 0 },
    );
    await expect(readAll(await ensureReadableStreamReady(flaky))).rejects.toThrow("connection reset");
  });
});

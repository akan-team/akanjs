import { describe, expect, test } from "bun:test";
import { EventStream } from "./eventStream";

const event = (idx: number) => ({ idx, pad: "x".repeat(80) });
const eventBytes = new TextEncoder().encode(`data: ${JSON.stringify(event(100))}\n\n`).byteLength;

type Reader = ReadableStreamDefaultReader<Uint8Array>;
const pendingReads = new WeakMap<Reader, ReturnType<Reader["read"]>>();
const readAvailable = async (reader: Reader) => {
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const read = pendingReads.get(reader) ?? reader.read();
    pendingReads.set(reader, read);
    const next = await Promise.race([read, Bun.sleep(20).then(() => null)]);
    if (!next) return text;
    pendingReads.delete(reader);
    if (next.done) return text;
    text += decoder.decode(next.value, { stream: true });
  }
};

const payloads = (text: string) =>
  text
    .split("\n\n")
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => JSON.parse(frame.slice("data: ".length)) as { idx?: number; type?: string; count?: number });

describe("EventStream", () => {
  test("queues every event for a reader that falls behind when no bound is set", async () => {
    const stream = new EventStream(() => undefined);
    const reader = stream.response().body?.getReader();
    if (!reader) throw new Error("no body");
    for (let idx = 0; idx < 1_000; idx += 1) stream.write(event(idx));
    const received = payloads(await readAvailable(reader));
    expect(received.length).toBe(1_000);
    expect(received.some((payload) => payload.type === "dropped")).toBe(false);
    stream.close();
  });

  test("a stalled reader holds no more than the bound, and hears what it missed when it reads again", async () => {
    const maxQueuedBytes = eventBytes * 10;
    const stream = new EventStream(() => undefined, { maxQueuedBytes });
    const reader = stream.response().body?.getReader();
    if (!reader) throw new Error("no body");
    for (let idx = 0; idx < 100; idx += 1) stream.write(event(idx));
    const resumed = payloads(await readAvailable(reader));
    expect(resumed).toEqual([...Array.from({ length: 10 }, (_, idx) => event(idx)), { type: "dropped", count: 90 }]);
    stream.write(event(100));
    expect(payloads(await readAvailable(reader))).toEqual([event(100)]);
    expect(stream.open).toBe(true);
    stream.close();
  });

  test("tears down a reader that stays stalled past the hard limit", async () => {
    let cancelled = 0;
    const stream = new EventStream(() => cancelled++, { maxQueuedBytes: eventBytes * 10, maxDropped: 50 });
    const reader = stream.response().body?.getReader();
    if (!reader) throw new Error("no body");
    for (let idx = 0; idx < 60; idx += 1) stream.write(event(idx));
    expect(stream.open).toBe(true);
    expect(cancelled).toBe(0);
    stream.write(event(60));
    expect(stream.open).toBe(false);
    expect(cancelled).toBe(1);
    expect(reader.read()).rejects.toThrow("stalled");
    stream.write(event(61));
    expect(cancelled).toBe(1);
  });
});

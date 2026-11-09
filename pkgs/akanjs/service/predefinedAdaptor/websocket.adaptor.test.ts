import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { WebSocketRedisAdaptor } from "./websocket.adaptor";

class FakeRedis extends EventEmitter {
  readonly published: number[] = [];
  readonly pending: { settle: () => void }[] = [];
  calls = 0;
  failing = false;
  held = false;
  disconnected = false;

  async connect() {}
  async subscribe() {}
  async unsubscribe() {}
  disconnect() {
    this.disconnected = true;
  }
  publish(_channel: string, message: Buffer) {
    this.calls += 1;
    const text = message.toString();
    const n = (JSON.parse(text.slice(text.indexOf("{"))) as { n: number }).n;
    return new Promise<number>((resolve, reject) => {
      const settle = () => {
        if (this.failing) return reject(new Error("connection lost"));
        this.published.push(n);
        resolve(1);
      };
      if (this.held) this.pending.push({ settle });
      else settle();
    });
  }
  release() {
    for (const { settle } of this.pending.splice(0)) settle();
  }
}

const until = async (condition: () => boolean) => {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await Bun.sleep(1);
  }
};

const openAdaptor = async () => {
  const publisher = new FakeRedis();
  const adaptor = new WebSocketRedisAdaptor();
  Object.assign(adaptor, {
    serverId: "server-a",
    channelPrefix: "app:",
    publisher,
    subscriber: new FakeRedis(),
    logger: { verbose: () => undefined, warn: () => undefined },
  });
  await adaptor.onInit();
  return { adaptor, publisher, send: (n: number) => adaptor.publish("room", { n }) };
};

describe("WebSocketRedisAdaptor buffer", () => {
  test("holds a message sent while the buffer drains behind it, so every message leaves in the order sent", async () => {
    const { publisher, send } = await openAdaptor();
    send(1);
    send(2);
    publisher.held = true;
    publisher.emit("ready");
    send(3);
    publisher.held = false;
    publisher.release();
    await until(() => publisher.published.length === 3);
    send(4);
    await until(() => publisher.published.length === 4);
    expect(publisher.published).toEqual([1, 2, 3, 4]);
  });

  test("puts a failed batch back ahead of what was sent after it", async () => {
    const { publisher, send } = await openAdaptor();
    send(1);
    send(2);
    publisher.failing = true;
    publisher.emit("ready");
    await Bun.sleep(5);
    publisher.emit("close");
    send(3);
    publisher.failing = false;
    publisher.emit("ready");
    await until(() => publisher.published.length === 3);
    expect(publisher.published).toEqual([1, 2, 3]);
  });

  test("waits for a drain in progress before it disconnects", async () => {
    const { adaptor, publisher, send } = await openAdaptor();
    send(1);
    publisher.held = true;
    publisher.emit("ready");
    const destroyed = adaptor.onDestroy();
    await Bun.sleep(5);
    expect(publisher.disconnected).toBe(false);
    publisher.release();
    await destroyed;
    expect(publisher.published).toEqual([1]);
    expect(publisher.disconnected).toBe(true);
  });

  test("puts direct publishes that fail together back in the order they were sent", async () => {
    const { publisher, send } = await openAdaptor();
    publisher.emit("ready");
    publisher.held = true;
    send(1);
    send(2);
    send(3);
    publisher.held = false;
    publisher.failing = true;
    publisher.release();
    await Bun.sleep(5);
    publisher.failing = false;
    send(4);
    await until(() => publisher.published.length === 4);
    expect(publisher.published).toEqual([1, 2, 3, 4]);
  });

  test("keeps a room's newest coalesced frame when frames for it fail together", async () => {
    const { adaptor, publisher, send } = await openAdaptor();
    publisher.emit("ready");
    publisher.held = true;
    send(1);
    adaptor.publish("live", { n: 2 }, { coalesce: true });
    adaptor.publish("live", { n: 3 }, { coalesce: true });
    publisher.held = false;
    publisher.failing = true;
    publisher.release();
    await Bun.sleep(5);
    publisher.failing = false;
    await until(() => publisher.published.includes(1) && publisher.published.length >= 2);
    expect(publisher.published).toEqual([1, 3]);
  });

  test("buffers until the publisher is ready, not merely connected", async () => {
    const { publisher, send } = await openAdaptor();
    send(1);
    publisher.emit("connect");
    await Bun.sleep(5);
    expect(publisher.published).toEqual([]);
    publisher.emit("ready");
    await until(() => publisher.published.length === 1);
    expect(publisher.published).toEqual([1]);
  });

  test("retries a batch an error reply refused on a timer, not on every later send", async () => {
    const { publisher, send } = await openAdaptor();
    send(1);
    publisher.failing = true;
    publisher.emit("ready");
    await Bun.sleep(5);
    for (let n = 2; n <= 50; n += 1) send(n);
    expect(publisher.calls).toBe(1);
    publisher.failing = false;
    await until(() => publisher.published.length === 50);
    expect(publisher.published).toEqual(Array.from({ length: 50 }, (_, idx) => idx + 1));
    expect(publisher.calls).toBe(51);
  });

  test("shuts down without waiting for a batch the publisher was cut off under", async () => {
    const { adaptor, publisher, send } = await openAdaptor();
    send(1);
    publisher.held = true;
    publisher.emit("ready");
    const destroyed = adaptor.onDestroy();
    await Bun.sleep(5);
    publisher.emit("close");
    await destroyed;
    expect(publisher.disconnected).toBe(true);
  });
});

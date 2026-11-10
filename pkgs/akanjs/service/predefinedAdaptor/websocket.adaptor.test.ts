import { describe, expect, jest, test } from "bun:test";
import { EventEmitter } from "node:events";
import { WebSocketRedisAdaptor } from "./websocket.adaptor";

class FakeRedis extends EventEmitter {
  readonly options: { autoResubscribe?: boolean } = {};
  readonly published: number[] = [];
  readonly channels: string[] = [];
  readonly pending: { settle: () => void }[] = [];
  readonly subscribed: string[] = [];
  readonly unsubscribed: string[] = [];
  readonly replies: { settle: (refused: boolean) => void }[] = [];
  calls = 0;
  failing = false;
  held = false;
  holdReplies = false;
  disconnected = false;

  async connect() {}
  subscribe(channel: string) {
    this.subscribed.push(channel);
    return new Promise<number>((resolve, reject) => {
      const settle = (refused: boolean) => (refused ? reject(new Error("NOPERM")) : resolve(1));
      if (this.holdReplies) this.replies.push({ settle });
      else settle(false);
    });
  }
  async unsubscribe(channel: string) {
    this.unsubscribed.push(channel);
    return 0;
  }
  reply(refused = false) {
    for (const { settle } of this.replies.splice(0)) settle(refused);
  }
  disconnect() {
    this.disconnected = true;
  }
  publish(channel: string, message: Buffer) {
    this.calls += 1;
    this.channels.push(channel);
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
  const subscriber = new FakeRedis();
  const adaptor = new WebSocketRedisAdaptor();
  Object.assign(adaptor, {
    serverId: "server-a",
    channelPrefix: "app:",
    publisher,
    subscriber,
    logger: { verbose: () => undefined, warn: () => undefined },
  });
  await adaptor.onInit();
  return { adaptor, publisher, subscriber, send: (n: number) => adaptor.publish("room", { n }) };
};

const newSocket = () => ({ data: {} }) as Bun.ServerWebSocket<unknown>;

const settledFlag = (promise: Promise<unknown>) => {
  const flag = { settled: false };
  void promise.then(() => {
    flag.settled = true;
  });
  return flag;
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

describe("WebSocketRedisAdaptor channels", () => {
  test("publishes a room's events to the shard its holders listen on, and a model's changes to the model's own", async () => {
    const holder = await openAdaptor();
    const writer = await openAdaptor();
    holder.subscriber.emit("ready");
    await holder.adaptor.joinRoom(newSocket(), "chat-1");
    await holder.adaptor.joinRoom(newSocket(), "task-news::digest", { live: "task" });
    writer.publisher.emit("ready");
    writer.adaptor.publish("chat-1", { n: 1 });
    writer.adaptor.publishChange({ refName: "task", next: "{}" });
    await until(() => writer.publisher.channels.length === 2);
    expect(writer.publisher.channels[0]).toMatch(/^app:ws:room:\d+$/);
    expect(writer.publisher.channels).toEqual(holder.subscriber.subscribed);
    expect(holder.subscriber.subscribed[1]).toBe("app:ws:change:task");
  });

  test("resolves a join once Redis confirms the SUBSCRIBE, and a room on the same channel waits for that reply", async () => {
    const { adaptor, subscriber } = await openAdaptor();
    subscriber.emit("ready");
    subscriber.holdReplies = true;
    const first = settledFlag(adaptor.joinRoom(newSocket(), "task-a::1", { live: "task" }));
    const second = settledFlag(adaptor.joinRoom(newSocket(), "task-b::2", { live: "task" }));
    await Bun.sleep(5);
    expect([first.settled, second.settled]).toEqual([false, false]);
    expect(subscriber.subscribed).toEqual(["app:ws:change:task"]);
    subscriber.reply();
    await until(() => first.settled && second.settled);
  });

  test("unsubscribes a channel when its last room here goes, and subscribes again for the next", async () => {
    const { adaptor, subscriber } = await openAdaptor();
    subscriber.emit("ready");
    const [alice, bob] = [newSocket(), newSocket()];
    await adaptor.joinRoom(alice, "task-a::1", { live: "task" });
    await adaptor.joinRoom(bob, "task-a::1", { live: "task" });
    await adaptor.joinRoom(bob, "task-b::2", { live: "task" });
    await adaptor.leaveRoom(alice, "task-a::1");
    await adaptor.unregisterSocket(alice);
    expect(subscriber.unsubscribed).toEqual([]);
    await adaptor.leaveRoom(bob, "task-b::2");
    expect(subscriber.unsubscribed).toEqual([]);
    await adaptor.unregisterSocket(bob);
    expect(subscriber.unsubscribed).toEqual(["app:ws:change:task"]);
    await adaptor.joinRoom(alice, "task-a::1", { live: "task" });
    expect(subscriber.subscribed).toEqual(["app:ws:change:task", "app:ws:change:task"]);
  });

  test("does not wait for Redis while the subscriber is down, nor once it drops mid-wait", async () => {
    const { adaptor, subscriber } = await openAdaptor();
    subscriber.holdReplies = true;
    const down = settledFlag(adaptor.joinRoom(newSocket(), "task-a::1", { live: "task" }));
    await Bun.sleep(5);
    expect(down.settled).toBe(true);
    subscriber.emit("ready");
    const waiting = settledFlag(adaptor.joinRoom(newSocket(), "note-a::1", { live: "note" }));
    await Bun.sleep(5);
    expect(waiting.settled).toBe(false);
    subscriber.emit("close");
    await until(() => waiting.settled);
  });

  test("stops waiting for a SUBSCRIBE reply after 3 s on a link that stalls without closing", async () => {
    const { adaptor, subscriber } = await openAdaptor();
    subscriber.emit("ready");
    subscriber.holdReplies = true;
    jest.useFakeTimers();
    try {
      const waiting = settledFlag(adaptor.joinRoom(newSocket(), "task-a::1", { live: "task" }));
      jest.advanceTimersByTime(2_999);
      for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
      expect(waiting.settled).toBe(false);
      jest.advanceTimersByTime(1);
      for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
      expect(waiting.settled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("subscribes every held channel again when the subscriber returns, and a join then waits for that reply", async () => {
    const { adaptor, subscriber } = await openAdaptor();
    subscriber.emit("ready");
    await adaptor.joinRoom(newSocket(), "task-a::1", { live: "task" });
    subscriber.emit("close");
    subscriber.holdReplies = true;
    subscriber.emit("ready");
    expect(subscriber.subscribed).toEqual(["app:ws:change:task", "app:ws:change:task"]);
    const rejoin = settledFlag(adaptor.joinRoom(newSocket(), "task-b::2", { live: "task" }));
    await Bun.sleep(5);
    expect(rejoin.settled).toBe(false);
    subscriber.reply();
    await until(() => rejoin.settled);
  });

  test("subscribes a channel whose SUBSCRIBE was dropped during an outage once the subscriber returns", async () => {
    const { adaptor, subscriber } = await openAdaptor();
    subscriber.holdReplies = true;
    await adaptor.joinRoom(newSocket(), "task-a::1", { live: "task" });
    subscriber.reply(true);
    await Bun.sleep(1);
    subscriber.holdReplies = false;
    subscriber.emit("ready");
    expect(subscriber.subscribed).toEqual(["app:ws:change:task", "app:ws:change:task"]);
  });

  test("leaves resubscribing to its own loop, so ioredis cannot bring back a channel whose UNSUBSCRIBE an outage dropped", async () => {
    const { subscriber } = await openAdaptor();
    expect(subscriber.options.autoResubscribe).toBe(false);
  });

  test("asks again for a channel whose SUBSCRIBE Redis refused, on the next join to it", async () => {
    const { adaptor, subscriber } = await openAdaptor();
    subscriber.emit("ready");
    subscriber.holdReplies = true;
    const refused = adaptor.joinRoom(newSocket(), "task-a::1", { live: "task" });
    subscriber.reply(true);
    await refused;
    subscriber.holdReplies = false;
    await adaptor.joinRoom(newSocket(), "task-b::2", { live: "task" });
    expect(subscriber.subscribed).toEqual(["app:ws:change:task", "app:ws:change:task"]);
  });
});

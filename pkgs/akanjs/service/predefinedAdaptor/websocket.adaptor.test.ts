import { heapStats } from "bun:jsc";
import { describe, expect, jest, setSystemTime, test } from "bun:test";
import { EventEmitter } from "node:events";
import { type LiveChange, WebSocketRedisAdaptor } from "./websocket.adaptor";

class FakeRedis extends EventEmitter {
  readonly options: { autoResubscribe?: boolean } = {};
  readonly published: number[] = [];
  readonly channels: string[] = [];
  readonly pending: { settle: () => void }[] = [];
  readonly subscribed: string[] = [];
  readonly unsubscribed: string[] = [];
  readonly replies: { settle: (refused: boolean) => void }[] = [];
  readonly sent: { channel: string; message: Buffer }[] = [];
  readonly refuse = new Set<string>();
  readonly failOn = new Set<string>();
  calls = 0;
  failing = false;
  held = false;
  holdReplies = false;
  disconnected = false;
  quits = 0;
  status = "ready";

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
    this.failing = true;
    this.release();
  }
  publish(channel: string, message: Buffer) {
    if ([...this.refuse].some((refused) => channel.startsWith(refused)))
      return Promise.reject(new Error("NOPERM User default has no permissions to access the channel"));
    this.calls += 1;
    this.channels.push(channel);
    const text = message.toString();
    const n = (JSON.parse(text.slice(text.indexOf("{"))) as { n: number }).n;
    return new Promise<number>((resolve, reject) => {
      const settle = () => {
        if (this.failing) return reject(new Error("connection lost"));
        if ([...this.failOn].some((failed) => channel.startsWith(failed)))
          return reject(new Error("READONLY You can't write against a read only replica."));
        this.published.push(n);
        this.sent.push({ channel, message });
        resolve(1);
      };
      if (this.held) this.pending.push({ settle });
      else settle();
    });
  }
  release() {
    for (const { settle } of this.pending.splice(0)) settle();
  }
  quit() {
    this.quits += 1;
    return new Promise<string>((resolve, reject) => {
      const answer = () => {
        if (this.failing) reject(new Error("Connection is closed."));
        else resolve("OK");
        queueMicrotask(() => this.emit("close"));
      };
      if (this.pending.length) this.pending.push({ settle: answer });
      else answer();
    });
  }
}

const until = async (condition: () => boolean) => {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await Bun.sleep(1);
  }
};

const openAdaptor = async (serverId = "server-a") => {
  const publisher = new FakeRedis();
  const subscriber = new FakeRedis();
  const adaptor = new WebSocketRedisAdaptor();
  const [warns, errors]: string[][] = [[], []];
  Object.assign(adaptor, {
    serverId,
    channelPrefix: "app:",
    publisher,
    subscriber,
    logger: {
      verbose: () => undefined,
      warn: (msg: string) => warns.push(msg),
      error: (msg: string) => errors.push(msg),
    },
  });
  await adaptor.onInit();
  return { adaptor, publisher, subscriber, warns, errors, send: (n: number) => adaptor.publish("room", { n }) };
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

  test("keeps only a room's newest coalesced frame while the publisher is down", async () => {
    const { adaptor, publisher } = await openAdaptor();
    adaptor.publish("live", { n: 1 }, { coalesce: true });
    adaptor.publish("live", { n: 2 }, { coalesce: true });
    publisher.emit("ready");
    await until(() => publisher.published.length === 1);
    await Bun.sleep(5);
    expect(publisher.published).toEqual([2]);
  });

  test("shuts down once Redis has answered every publish sent before it, and quietly", async () => {
    const { adaptor, publisher, send, warns } = await openAdaptor();
    publisher.emit("ready");
    publisher.held = true;
    send(1);
    send(2);
    const destroyed = adaptor.onDestroy();
    await Bun.sleep(5);
    expect(publisher.quits).toBe(1);
    expect(publisher.disconnected).toBe(false);
    publisher.release();
    await destroyed;
    expect(publisher.published).toEqual([1, 2]);
    expect(publisher.disconnected).toBe(true);
    expect(warns).toEqual([]);
  });

  test("stops waiting for Redis to answer at shutdown after a second, and warns", async () => {
    const { adaptor, publisher, send, warns } = await openAdaptor();
    publisher.emit("ready");
    publisher.held = true;
    send(1);
    jest.useFakeTimers();
    try {
      const destroyed = settledFlag(adaptor.onDestroy());
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      jest.advanceTimersByTime(999);
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(destroyed.settled).toBe(false);
      jest.advanceTimersByTime(1);
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(destroyed.settled).toBe(true);
      expect(publisher.disconnected).toBe(true);
      expect(warns.filter((warn) => warn.startsWith("Redis did not answer"))).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("holds a stalled drain at shutdown to the same second, and warns", async () => {
    const { adaptor, publisher, send, warns } = await openAdaptor();
    send(1);
    publisher.held = true;
    publisher.emit("ready");
    jest.useFakeTimers();
    try {
      const destroyed = settledFlag(adaptor.onDestroy());
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      jest.advanceTimersByTime(999);
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(destroyed.settled).toBe(false);
      jest.advanceTimersByTime(1);
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(destroyed.settled).toBe(true);
      expect(warns.filter((warn) => warn.startsWith("Redis did not answer"))).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("stops waiting at once when the link closes before Redis answers QUIT", async () => {
    const { adaptor, publisher, send, warns } = await openAdaptor();
    publisher.emit("ready");
    publisher.held = true;
    send(1);
    jest.useFakeTimers();
    try {
      const destroyed = settledFlag(adaptor.onDestroy());
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(publisher.quits).toBe(1);
      publisher.status = "end";
      publisher.emit("close");
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(destroyed.settled).toBe(true);
      expect(publisher.disconnected).toBe(false);
      expect(warns.filter((warn) => warn.startsWith("Redis did not answer"))).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("sends no QUIT to a publisher that is down at shutdown", async () => {
    const { adaptor, publisher } = await openAdaptor();
    await adaptor.onDestroy();
    expect(publisher.quits).toBe(0);
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

  test("retries only the publishes of a batch that failed, after the ones that went out", async () => {
    const { adaptor, publisher, send } = await openAdaptor();
    send(1);
    adaptor.publishChange({ refName: "task", next: "{}" });
    send(2);
    publisher.failOn.add("app:ws:change:");
    publisher.emit("ready");
    await until(() => publisher.published.length === 2);
    publisher.failOn.clear();
    await until(() => publisher.sent.length === 3);
    await Bun.sleep(5);
    expect(publisher.sent.map(({ channel }) => (channel.startsWith("app:ws:change:") ? "change" : "room"))).toEqual([
      "room",
      "room",
      "change",
    ]);
    expect(publisher.published.slice(0, 2)).toEqual([1, 2]);
  });

  test("drops an event Redis refuses with NOPERM, buffered or sent directly, rather than holding back what follows", async () => {
    const { adaptor, publisher, send, warns, errors } = await openAdaptor();
    const change = () => adaptor.publishChange({ refName: "task", next: "{}" });
    publisher.refuse.add("app:ws:change:");
    send(1);
    change();
    send(2);
    publisher.emit("ready");
    await until(() => publisher.published.length === 2);
    await Bun.sleep(5);
    expect(warns).toEqual([]);
    change();
    send(3);
    await until(() => publisher.published.length === 3);
    await Bun.sleep(5);
    expect(warns).toEqual([]);
    expect(publisher.published).toEqual([1, 2, 3]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("events on app:ws:change are being dropped");
  });

  test("logs refusals on a family of channels at most once a minute, whatever shard they name", async () => {
    const { adaptor, publisher, errors } = await openAdaptor();
    publisher.refuse.add("app:ws:room:");
    publisher.emit("ready");
    try {
      setSystemTime(new Date("2026-11-11T00:00:00Z"));
      for (let n = 0; n < 20; n += 1) adaptor.publish(`room-${n}`, { n });
      await Bun.sleep(5);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("events on app:ws:room are being dropped");
      setSystemTime(new Date("2026-11-11T00:00:59Z"));
      adaptor.publish("room-20", { n: 20 });
      await Bun.sleep(5);
      expect(errors).toHaveLength(1);
      setSystemTime(new Date("2026-11-11T00:01:00Z"));
      adaptor.publish("room-21", { n: 21 });
      await Bun.sleep(5);
      expect(errors).toHaveLength(2);
    } finally {
      setSystemTime();
    }
  });

  test("warns of a dropped link, but not of the one its own shutdown closes", async () => {
    const { adaptor, publisher, subscriber, warns } = await openAdaptor();
    publisher.emit("ready");
    subscriber.emit("ready");
    await adaptor.joinRoom(newSocket(), "chat-1");
    publisher.emit("close");
    subscriber.emit("close");
    expect(warns).toHaveLength(2);
    publisher.emit("ready");
    subscriber.emit("ready");
    warns.length = 0;
    //? Sooner than ioredis, which emits it a tick later, so a ready flag cleared only after `disconnect()` fails here.
    publisher.disconnect = () => publisher.emit("close");
    subscriber.disconnect = () => subscriber.emit("close");
    await adaptor.onDestroy();
    expect(warns).toEqual([]);
  });

  test("neither warns nor asks for a resync when a link holding no channel drops, as Redis's idle timeout does", async () => {
    const { adaptor, subscriber, warns } = await openAdaptor();
    let recovered = 0;
    adaptor.onRecovered(() => {
      recovered += 1;
    });
    subscriber.emit("ready");
    subscriber.emit("close");
    subscriber.emit("ready");
    expect(warns).toEqual([]);
    expect(recovered).toBe(0);
  });

  test("asks for a resync when the subscriber returns to a room joined while it was down", async () => {
    const { adaptor, subscriber, warns } = await openAdaptor();
    let recovered = 0;
    adaptor.onRecovered(() => {
      recovered += 1;
    });
    subscriber.emit("ready");
    subscriber.emit("close");
    await adaptor.joinRoom(newSocket(), "chat-1");
    subscriber.emit("ready");
    expect(recovered).toBe(1);
    expect(warns).toEqual(["Subscriber reconnected; asking every room on this server to resynchronize"]);
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

  test("hears the event and the change another server publishes", async () => {
    const reader = await openAdaptor("server-b");
    const writer = await openAdaptor("server-a");
    reader.subscriber.emit("ready");
    writer.publisher.emit("ready");
    await reader.adaptor.joinRoom(newSocket(), "chat-1");
    const received: unknown[] = [];
    const changes: LiveChange[] = [];
    reader.adaptor.setEventHandler((_roomId, data) => received.push(data));
    reader.adaptor.onChange((change) => changes.push(change));
    writer.adaptor.publish("chat-1", { n: 1 });
    writer.adaptor.publishChange({ refName: "task", next: "{}" });
    await until(() => writer.publisher.sent.length === 2);
    for (const { channel, message } of writer.publisher.sent)
      reader.subscriber.emit("messageBuffer", Buffer.from(channel), message);
    expect(received).toEqual([{ n: 1 }]);
    expect(changes).toEqual([{ refName: "task", next: "{}" }]);
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

  test("keeps nothing per join once it resolves, though the subscriber stays up", async () => {
    const { adaptor, subscriber } = await openAdaptor();
    subscriber.emit("ready");
    const socket = newSocket();
    const cycle = async (times: number) => {
      for (let n = 0; n < times; n += 1) {
        await adaptor.joinRoom(socket, "chat-1");
        await adaptor.leaveRoom(socket, "chat-1");
      }
      subscriber.subscribed.length = 0;
      subscriber.unsubscribed.length = 0;
    };
    const promises = () => {
      Bun.gc(true);
      return heapStats().objectTypeCounts.Promise ?? 0;
    };
    await cycle(100);
    const before = promises();
    await cycle(10_000);
    expect(promises() - before).toBeLessThan(1_000);
  });
});

describe("WebSocketRedisAdaptor envelope", () => {
  const frame = (kind: number, origin: string, roomId: string, payload: Buffer) =>
    Buffer.concat([
      Buffer.from([1, kind, 0, origin.length]),
      Buffer.from(origin),
      Buffer.from([0, roomId.length]),
      Buffer.from(roomId),
      payload,
    ]);

  test("publishes a JSON event as version, kind 0x6a, origin, room and payload", async () => {
    const { adaptor, publisher } = await openAdaptor("server-a");
    publisher.emit("ready");
    adaptor.publish("chat-1", { n: 1 });
    await until(() => publisher.sent.length === 1);
    expect(publisher.sent[0].message).toEqual(frame(0x6a, "server-a", "chat-1", Buffer.from('{"n":1}')));
  });

  test("reads a change of kind 0x63 and a bytes event of kind 0x62 from another server", async () => {
    const { adaptor, subscriber } = await openAdaptor("server-b");
    subscriber.emit("ready");
    await adaptor.joinRoom(newSocket(), "chat-1");
    const received: unknown[] = [];
    const changes: LiveChange[] = [];
    adaptor.setEventHandler((roomId, data) => received.push({ roomId, data }));
    adaptor.onChange((change) => changes.push(change));
    const deliver = (message: Buffer) => subscriber.emit("messageBuffer", Buffer.from("app:ws:room:1"), message);
    deliver(frame(0x63, "server-a", "", Buffer.from('{"refName":"task","next":"{}"}')));
    deliver(frame(0x62, "server-a", "chat-1", Buffer.from([7, 250])));
    expect(changes).toEqual([{ refName: "task", next: "{}" }]);
    expect(received).toEqual([{ roomId: "chat-1", data: new Uint8Array([7, 250]) }]);
  });
});

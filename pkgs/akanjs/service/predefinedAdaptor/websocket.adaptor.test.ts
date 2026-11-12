import { heapStats } from "bun:jsc";
import { describe, expect, jest, setSystemTime, test } from "bun:test";
import { EventEmitter } from "node:events";
import { type LiveChange, WebSocketRedisAdaptor } from "./websocket.adaptor";

// TODO(#458): every server of this release also publishes and listens on the channel of earlier releases.
const legacyChannel = "app:ws:broadcast";

class FakeRedis extends EventEmitter {
  readonly options: { autoResubscribe?: boolean } = {};
  readonly published: number[] = [];
  readonly channels: string[] = [];
  readonly pending: { settle: () => void }[] = [];
  readonly subscribed: string[] = [];
  readonly unsubscribed: string[] = [];
  readonly replies: { settle: (refused: boolean) => void }[] = [];
  readonly sent: { channel: string; message: Buffer }[] = [];
  readonly legacy: Buffer[] = [];
  readonly refuse = new Set<string>();
  legacySubscribes = 0;
  calls = 0;
  failing = false;
  held = false;
  holdReplies = false;
  disconnected = false;
  quits = 0;

  async connect() {}
  subscribe(channel: string) {
    if (channel === legacyChannel) {
      this.legacySubscribes += 1;
      return Promise.resolve(1);
    }
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
    if (channel === legacyChannel) {
      this.legacy.push(message);
      this.sent.push({ channel, message });
      return Promise.resolve(1);
    }
    this.calls += 1;
    this.channels.push(channel);
    const text = message.toString();
    const n = (JSON.parse(text.slice(text.indexOf("{"))) as { n: number }).n;
    return new Promise<number>((resolve, reject) => {
      const settle = () => {
        if (this.failing) return reject(new Error("connection lost"));
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

//? The envelope as `#unpack` and `#receive` read it up to v3.2.0-rc.5, which skip only their own origin.
const readAsEarlierRelease = (message: Buffer, ownId: string) => {
  if (message.readUInt8(0) !== 1) return null;
  const kind = String.fromCharCode(message.readUInt8(1));
  const originLength = message.readUInt16BE(2);
  if (message.subarray(4, 4 + originLength).toString("utf-8") === ownId) return null;
  const roomLength = message.readUInt16BE(4 + originLength);
  const roomStart = 6 + originLength;
  const roomId = message.subarray(roomStart, roomStart + roomLength).toString("utf-8");
  return { kind, roomId, data: JSON.parse(message.subarray(roomStart + roomLength).toString()) as unknown };
};

const packAsEarlierRelease = (kind: "j" | "c", origin: string, roomId: string, data: unknown) => {
  const [originBytes, roomBytes] = [Buffer.from(origin), Buffer.from(roomId)];
  const header = Buffer.alloc(6 + originBytes.length + roomBytes.length);
  header.writeUInt8(1, 0);
  header.writeUInt8(kind.charCodeAt(0), 1);
  header.writeUInt16BE(originBytes.length, 2);
  originBytes.copy(header, 4);
  header.writeUInt16BE(roomBytes.length, 4 + originBytes.length);
  roomBytes.copy(header, 6 + originBytes.length);
  return Buffer.concat([header, Buffer.from(JSON.stringify(data))]);
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
      publisher.emit("close");
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(destroyed.settled).toBe(true);
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

  test("drops an event Redis refuses with NOPERM, buffered or sent directly, rather than holding back what follows", async () => {
    const { publisher, send, warns, errors } = await openAdaptor();
    publisher.refuse.add(legacyChannel);
    send(1);
    send(2);
    publisher.emit("ready");
    await until(() => publisher.published.length === 2);
    await Bun.sleep(5);
    expect(warns).toEqual([]);
    send(3);
    await until(() => publisher.published.length === 3);
    await Bun.sleep(5);
    expect(warns).toEqual([]);
    expect(publisher.published).toEqual([1, 2, 3]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`events on ${legacyChannel} are being dropped`);
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

describe("WebSocketRedisAdaptor alongside earlier releases", () => {
  test("copies each event and change to ws:broadcast as earlier releases read it, from an origin none takes for its own", async () => {
    const { adaptor, publisher } = await openAdaptor();
    publisher.emit("ready");
    adaptor.publish("chat-1", { n: 1 });
    adaptor.publishChange({ refName: "task", next: "{}" });
    await until(() => publisher.legacy.length === 2);
    expect(publisher.legacy.map((message) => readAsEarlierRelease(message, "server-a"))).toEqual([
      { kind: "j", roomId: "chat-1", data: { n: 1 } },
      { kind: "c", roomId: "", data: { refName: "task", next: "{}" } },
    ]);
  });

  test("hears another server's event and change once, and an earlier release's from ws:broadcast", async () => {
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
    await until(() => writer.publisher.sent.length === 4);
    for (const { channel, message } of writer.publisher.sent)
      reader.subscriber.emit("messageBuffer", Buffer.from(channel), message);
    const deliver = (message: Buffer) => reader.subscriber.emit("messageBuffer", Buffer.from(legacyChannel), message);
    deliver(packAsEarlierRelease("j", "server-old", "chat-1", { n: 2 }));
    deliver(packAsEarlierRelease("c", "server-old", "", { refName: "note", next: "{}" }));
    expect(received).toEqual([{ n: 1 }, { n: 2 }]);
    expect(changes).toEqual([
      { refName: "task", next: "{}" },
      { refName: "note", next: "{}" },
    ]);
  });

  test("listens on ws:broadcast again each time the subscriber returns", async () => {
    const { subscriber } = await openAdaptor();
    subscriber.emit("ready");
    subscriber.emit("close");
    subscriber.emit("ready");
    expect(subscriber.legacySubscribes).toBe(2);
  });

  test("coalesces a room's buffered copies on ws:broadcast apart from those on its own channel", async () => {
    const { adaptor, publisher } = await openAdaptor();
    adaptor.publish("live", { n: 1 }, { coalesce: true });
    adaptor.publish("live", { n: 2 }, { coalesce: true });
    publisher.emit("ready");
    await until(() => publisher.published.length === 1 && publisher.legacy.length === 1);
    expect(publisher.published).toEqual([2]);
    expect(readAsEarlierRelease(publisher.legacy[0], "server-old")?.data).toEqual({ n: 2 });
  });

  test("retries a copy refused on one channel without sending the other again", async () => {
    const { publisher, send } = await openAdaptor();
    send(1);
    publisher.failing = true;
    publisher.emit("ready");
    await Bun.sleep(5);
    publisher.failing = false;
    await until(() => publisher.published.length === 1);
    expect(publisher.legacy.length).toBe(1);
  });
});

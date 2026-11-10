import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Redis } from "ioredis";
import { ConformanceEnv } from "../../test/conformance";
import { type LiveChange, WebSocketRedisAdaptor } from "./websocket.adaptor";

// Cross-server delivery must equal what the publishing server's own socket gets; the single-node transport has no
// second server, so it is tested end to end. Ids are from `local/database-modes/01-multiple-redis.md`.

interface Received {
  roomId: string;
  data: unknown;
}

const openServer = async (serverId: string, app: string) => {
  const { Redis } = await import("ioredis");
  const client: Redis = new Redis(ConformanceEnv.url("redis") as string, { lazyConnect: true });
  await client.connect();
  const adaptor = new WebSocketRedisAdaptor();
  Object.assign(adaptor, {
    serverId,
    publisher: client.duplicate({ lazyConnect: true }),
    subscriber: client.duplicate({ lazyConnect: true }),
    // One instance per app, the way two apps sharing a Redis would each build theirs.
    channelPrefix: `${app}:testing:`,
    logger: { verbose: () => undefined, warn: () => undefined, error: () => undefined },
  });
  await adaptor.onInit();
  const received: Received[] = [];
  adaptor.setEventHandler((roomId, data) => received.push({ roomId, data }));
  const changes: LiveChange[] = [];
  adaptor.onChange((change) => changes.push(change));
  const socket = { data: {} } as Bun.ServerWebSocket<unknown>;
  let heard = 0;
  // TODO(#458): every server also hears the copies on the channel of earlier releases, which it skips.
  adaptor.subscriber.on("messageBuffer", (channel: Buffer) => {
    if (!channel.toString().endsWith(":ws:broadcast")) heard += 1;
  });
  return {
    adaptor,
    client,
    received,
    changes,
    heard: () => heard,
    join: async (roomId: string) => await adaptor.joinRoom(socket, roomId),
    joinLive: async (roomId: string, refName: string) => await adaptor.joinRoom(socket, roomId, { live: refName }),
    leave: async (roomId: string) => await adaptor.leaveRoom(socket, roomId),
    close: async () => {
      await adaptor.onDestroy();
      client.disconnect();
    },
  };
};

const until = async (condition: () => boolean, timeoutMs = 2_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await Bun.sleep(10);
};

//? The envelope as `#unpack` and `#receive` read it up to v3.2.0-rc.5, which skip only their own origin.
const readAsEarlierRelease = (message: Buffer, ownId: string) => {
  const originLength = message.readUInt16BE(2);
  if (message.readUInt8(0) !== 1 || message.subarray(4, 4 + originLength).toString() === ownId) return null;
  const kind = String.fromCharCode(message.readUInt8(1));
  const roomStart = 6 + originLength;
  const roomEnd = roomStart + message.readUInt16BE(4 + originLength);
  const payload = message.subarray(roomEnd);
  const data = kind === "b" ? [...payload] : (JSON.parse(payload.toString()) as unknown);
  return { kind, roomId: message.subarray(roomStart, roomEnd).toString(), data };
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

describe.skipIf(!ConformanceEnv.has("pubsub conformance", "redis"))("pubsub conformance (redis)", () => {
  let publisher: Awaited<ReturnType<typeof openServer>>;
  let subscriber: Awaited<ReturnType<typeof openServer>>;
  let otherApp: Awaited<ReturnType<typeof openServer>>;
  // Room ids are unique per run: the app names below are shared by every run against this Redis.
  const pulse = ConformanceEnv.uniqueName("pulse");
  const frames = ConformanceEnv.uniqueName("frames");
  const envelope = ConformanceEnv.uniqueName("envelope");

  beforeAll(async () => {
    publisher = await openServer("server-a", "alpha");
    subscriber = await openServer("server-b", "alpha");
    otherApp = await openServer("server-c", "beta");
  });
  afterAll(async () => {
    for (const server of [publisher, subscriber, otherApp]) await server?.close();
  });

  const deliveredTo = async (server: { received: Received[] }, roomId: string) => {
    await until(() => server.received.some((item) => item.roomId === roomId));
    return server.received.filter((item) => item.roomId === roomId).map(({ data }) => data);
  };

  test("an event published on one server reaches the other, and not the publisher itself", async () => {
    const roomId = `${pulse}-plain`;
    await publisher.join(roomId);
    await subscriber.join(roomId);
    publisher.adaptor.publish(roomId, { label: "hello", count: 7, ratio: 0.5 });
    expect(await deliveredTo(subscriber, roomId)).toEqual([{ label: "hello", count: 7, ratio: 0.5 }]);
    expect(publisher.received.filter((item) => item.roomId === roomId)).toEqual([]);
  });

  test("a Binary frame arrives byte for byte", async () => {
    const roomId = `${frames}-video`;
    await subscriber.join(roomId);
    publisher.adaptor.publish(roomId, new Uint8Array([1, 2, 3, 250]));
    const [bytes] = await deliveredTo(subscriber, roomId);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...(bytes as Uint8Array)]).toEqual([1, 2, 3, 250]);
  });

  test("an Any envelope (a live event) arrives as sent", async () => {
    const roomId = `${envelope}-list`;
    await subscriber.join(roomId);
    const event = { op: "update", id: "doc-1", light: { title: "t", tags: ["a"] } };
    publisher.adaptor.publish(roomId, event);
    expect(await deliveredTo(subscriber, roomId)).toEqual([event]);
  });

  test("[P-1] an app sharing the Redis does not receive this app's events", async () => {
    const roomId = `${pulse}-isolated`;
    await subscriber.join(roomId);
    await otherApp.join(roomId);
    publisher.adaptor.publish(roomId, { label: "private", count: 1, ratio: 1 });
    await deliveredTo(subscriber, roomId);
    await Bun.sleep(50);
    expect(otherApp.received.filter((item) => item.roomId === roomId)).toEqual([]);
  });

  test("[P-2] a server with nobody in the room hands the event to no one", async () => {
    const roomId = `${pulse}-empty`;
    publisher.adaptor.publish(roomId, { label: "before", count: 1, ratio: 1 });
    await Bun.sleep(50);
    await subscriber.join(roomId);
    publisher.adaptor.publish(roomId, { label: "joined", count: 2, ratio: 1 });
    await deliveredTo(subscriber, roomId);
    await subscriber.leave(roomId);
    publisher.adaptor.publish(roomId, { label: "left", count: 3, ratio: 1 });
    await Bun.sleep(50);
    expect(subscriber.received.filter((item) => item.roomId === roomId).map(({ data }) => data)).toEqual([
      { label: "joined", count: 2, ratio: 1 },
    ]);
  });

  test("[P-3] an Int past 32 bits and a Float's decimals arrive intact", async () => {
    const roomId = `${pulse}-precise`;
    await subscriber.join(roomId);
    publisher.adaptor.publish(roomId, { label: "geo", count: 3_000_000_000, ratio: 127.0276 });
    expect(await deliveredTo(subscriber, roomId)).toEqual([{ label: "geo", count: 3_000_000_000, ratio: 127.0276 }]);
  });

  test("[P-4][P-5] the event arrives as the text the publisher's own sockets got, whatever the model", async () => {
    const roomId = `${pulse}-masked`;
    await subscriber.join(roomId);
    const sent = { label: "masked", count: 2, at: new Date(1_727_000_000_123), extra: { nested: [null] } };
    publisher.adaptor.publish(roomId, sent);
    const [event] = await deliveredTo(subscriber, roomId);
    expect(JSON.stringify(event)).toBe(JSON.stringify(sent));
  });

  // A live room is routed by its socket's server, so a write reaches every server holding a live room of its model.
  test("[L-1] a committed write reaches every other server holding a live room of its model, and only those", async () => {
    const change: LiveChange = {
      refName: ConformanceEnv.uniqueName("model"),
      next: `{"id":"a"}`,
      previous: `{"id":"a"}`,
    };
    const bystander = await openServer("server-d", "alpha");
    await publisher.joinLive(`${envelope}-writer::1`, change.refName);
    await subscriber.joinLive(`${envelope}-reader::1`, change.refName);
    await otherApp.joinLive(`${envelope}-reader::1`, change.refName);
    publisher.adaptor.publishChange(change);
    await until(() => subscriber.changes.some(({ refName }) => refName === change.refName));
    await Bun.sleep(50);
    const named = (server: { changes: LiveChange[] }) =>
      server.changes.filter(({ refName }) => refName === change.refName);
    expect(named(subscriber)).toEqual([change]);
    expect(named(publisher)).toEqual([]);
    expect(named(otherApp)).toEqual([]);
    expect(bystander.heard()).toBe(0);
    await bystander.close();
  });

  test("[L-2] a server stops hearing a model's changes once its last live room of it goes", async () => {
    const refName = ConformanceEnv.uniqueName("model");
    const reader = await openServer("server-d", "alpha");
    await reader.joinLive(`${envelope}-first::1`, refName);
    await reader.joinLive(`${envelope}-second::2`, refName);
    publisher.adaptor.publishChange({ refName, next: `{"id":"a"}` });
    await until(() => reader.changes.length === 1);
    await reader.leave(`${envelope}-first::1`);
    publisher.adaptor.publishChange({ refName, next: `{"id":"b"}` });
    await until(() => reader.changes.length === 2);
    await reader.leave(`${envelope}-second::2`);
    //? A leave does not wait for the UNSUBSCRIBE: a change heard after it is only routed to no room.
    await Bun.sleep(50);
    publisher.adaptor.publishChange({ refName, next: `{"id":"c"}` });
    await Bun.sleep(50);
    expect(reader.changes.map(({ next }) => next)).toEqual([`{"id":"a"}`, `{"id":"b"}`]);
    expect(reader.heard()).toBe(2);
    await reader.close();
  });

  test("[P-9] Redis hands a room's events only to a server holding a room on its shard, from the moment its join resolves", async () => {
    const roomId = `${pulse}-sharded`;
    const reader = await openServer("server-d", "alpha");
    publisher.adaptor.publish(roomId, { label: "unheld", count: 1, ratio: 1 });
    await Bun.sleep(50);
    expect(reader.heard()).toBe(0);
    await reader.join(roomId);
    publisher.adaptor.publish(roomId, { label: "held", count: 2, ratio: 1 });
    expect(await deliveredTo(reader, roomId)).toEqual([{ label: "held", count: 2, ratio: 1 }]);
    expect(reader.heard()).toBe(1);
    await reader.close();
  });

  test("[P-8] a live room keyed only by internal arguments crosses servers", async () => {
    const roomId = `${envelope}::user-1`;
    await subscriber.join(roomId);
    publisher.adaptor.publish(roomId, { op: "invalidate", id: "" });
    expect(await deliveredTo(subscriber, roomId)).toEqual([{ op: "invalidate", id: "" }]);
  });

  test("[P-7] a coalescing room's frames published during an outage arrive as the newest one", async () => {
    const coalesced = `${frames}-outage`;
    const queued = `${frames}-queued`;
    await subscriber.join(coalesced);
    await subscriber.join(queued);
    publisher.adaptor.publisher.disconnect();
    await Bun.sleep(20);
    for (const frame of [1, 2, 3]) {
      publisher.adaptor.publish(coalesced, new Uint8Array([frame]), { coalesce: true });
      publisher.adaptor.publish(queued, new Uint8Array([frame]));
    }
    await publisher.adaptor.publisher.connect();
    await until(() => subscriber.received.filter((item) => item.roomId === queued).length === 3);
    await Bun.sleep(50);
    const framesOf = (roomId: string) =>
      subscriber.received.filter((item) => item.roomId === roomId).map(({ data }) => [...(data as Uint8Array)]);
    expect(framesOf(coalesced)).toEqual([[3]]);
    expect(framesOf(queued)).toEqual([[1], [2], [3]]);
  });

  test("[P-10] a reconnect subscribes again the channels a server holds, and none it has left", async () => {
    const roomId = `${pulse}-returning`;
    const stray = `alpha:testing:ws:change:${ConformanceEnv.uniqueName("left")}`;
    const reader = await openServer("server-d", "alpha");
    await reader.join(roomId);
    await reader.adaptor.subscriber.subscribe(stray);
    const returned = new Promise((resolve) => reader.adaptor.subscriber.once("ready", resolve));
    reader.adaptor.subscriber.disconnect(true);
    await returned;
    await reader.join(roomId);
    await reader.adaptor.subscriber.ping();
    publisher.adaptor.publish(roomId, { label: "returned", count: 1, ratio: 1 });
    expect(await deliveredTo(reader, roomId)).toEqual([{ label: "returned", count: 1, ratio: 1 }]);
    expect(await reader.client.pubsub("NUMSUB", stray)).toEqual([stray, 0]);
    await reader.close();
  });

  test("[C-1] a server of an earlier release and one of this release hear each other's events and changes once", async () => {
    const { Redis } = await import("ioredis");
    const legacyChannel = "alpha:testing:ws:broadcast";
    const roomId = `${pulse}-mixed`;
    const refName = ConformanceEnv.uniqueName("model");
    const earlier = new Redis(ConformanceEnv.url("redis") as string);
    const earlierListener = earlier.duplicate();
    const heardByEarlier: Buffer[] = [];
    earlierListener.on("messageBuffer", (_channel: Buffer, message: Buffer) => heardByEarlier.push(message));
    await earlierListener.subscribe(legacyChannel);
    const reader = await openServer("server-d", "alpha");
    await reader.join(roomId);
    await reader.joinLive(`${envelope}-mixed::1`, refName);

    publisher.adaptor.publish(roomId, { label: "this", count: 1, ratio: 1 });
    publisher.adaptor.publish(roomId, new Uint8Array([7, 250]));
    publisher.adaptor.publishChange({ refName, next: `{"id":"a"}` });
    await earlier.publish(legacyChannel, packAsEarlierRelease("j", "server-old", roomId, { label: "earlier" }));
    await earlier.publish(legacyChannel, packAsEarlierRelease("c", "server-old", "", { refName, next: `{"id":"b"}` }));
    const readByEarlier = () =>
      heardByEarlier
        .map((message) => readAsEarlierRelease(message, "server-old"))
        .filter((read) => read?.roomId === roomId || (read?.data as LiveChange | undefined)?.refName === refName);
    await until(() => reader.received.length >= 3 && reader.changes.length >= 2 && readByEarlier().length >= 3);
    await Bun.sleep(50);

    expect(readByEarlier()).toEqual([
      { kind: "j", roomId, data: { label: "this", count: 1, ratio: 1 } },
      { kind: "b", roomId, data: [7, 250] },
      { kind: "c", roomId: "", data: { refName, next: `{"id":"a"}` } },
    ]);
    const heardHere = reader.received.map(({ data }) => (data instanceof Uint8Array ? [...data] : data));
    expect(heardHere).toHaveLength(3);
    expect(heardHere).toEqual(
      expect.arrayContaining([{ label: "this", count: 1, ratio: 1 }, [7, 250], { label: "earlier" }]),
    );
    expect(reader.changes.map(({ next }) => next)).toHaveLength(2);
    expect(reader.changes.map(({ next }) => next)).toEqual(expect.arrayContaining([`{"id":"a"}`, `{"id":"b"}`]));
    earlierListener.disconnect();
    earlier.disconnect();
    await reader.close();
  });
});

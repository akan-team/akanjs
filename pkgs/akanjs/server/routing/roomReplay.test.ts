import { describe, expect, test } from "bun:test";
import { SolidPubSub, WebSocketRedisAdaptor, type WebsocketAdaptor } from "akanjs/service";
import { RoomReplay } from "./roomReplay";

const pub = (roomId: string, n: number) => ({ type: "pub" as const, roomId, data: { n } });

const until = async (condition: () => boolean, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the socket");
    await Bun.sleep(2);
  }
};

describe("RoomReplay", () => {
  test("numbers a watched room's frames from 1 and leaves an unwatched room's alone", () => {
    const replay = new RoomReplay({ vouches: true });
    expect(replay.frameOf(pub("idle", 0), false)).toBe(JSON.stringify(pub("idle", 0)));
    replay.watch("room");
    expect(JSON.parse(replay.frameOf(pub("room", 1), true))).toMatchObject({ seq: 1 });
    expect(JSON.parse(replay.frameOf(pub("room", 2), false))).toMatchObject({ seq: 2 });
    expect(replay.cursor("room")).toMatchObject({ seq: 2 });
    expect(replay.cursor("idle")).toBeNull();
  });

  test("hands back what followed a cursor, and a gap when it cannot vouch for all of it", () => {
    const replay = new RoomReplay({ vouches: true, depth: 3 });
    replay.watch("room");
    const cursor = replay.cursor("room");
    if (!cursor) throw new Error("watched room has no cursor");
    for (const n of [1, 2, 3, 4, 5]) replay.frameOf(pub("room", n), true);
    expect(replay.since("room", { epoch: cursor.epoch, seq: 3 })?.map((frame) => JSON.parse(frame).seq)).toEqual([
      4, 5,
    ]);
    expect(replay.since("room", { epoch: cursor.epoch, seq: 5 })).toEqual([]);
    expect(replay.since("room", { epoch: cursor.epoch, seq: 1 })).toBeNull();
    expect(replay.since("room", { epoch: "another", seq: 3 })).toBeNull();
    expect(replay.since("room", { epoch: cursor.epoch, seq: 9 })).toBeNull();
    expect(new RoomReplay({ vouches: false }).since("room", { epoch: cursor.epoch, seq: 3 })).toBeNull();
  });

  test("replays nothing published before the subscribe a cursor was handed to, whatever seq it names", () => {
    const replay = new RoomReplay({ vouches: true });
    replay.watch("room");
    for (const n of [1, 2, 3]) replay.frameOf(pub("room", n), true);
    const late = replay.cursor("room");
    if (!late) throw new Error("watched room has no cursor");
    expect(replay.since("room", { epoch: late.epoch, seq: 0 })).toBeNull();
    expect(replay.since("room", { epoch: late.epoch, seq: 3 })).toEqual([]);
    const [processId, generation, , mac] = late.epoch.split(".");
    expect(replay.since("room", { epoch: [processId, generation, "0", mac].join("."), seq: 0 })).toBeNull();
    replay.watch("other");
    expect(replay.since("other", { epoch: late.epoch, seq: 0 })).toBeNull();
  });

  test("forgets a room nobody watched for retainMs, and numbers it afresh under a new epoch", () => {
    const replay = new RoomReplay({ vouches: true, retainMs: 1_000 });
    replay.watch("room", 0);
    replay.frameOf(pub("room", 1), false, 10);
    const before = replay.cursor("room");
    expect(replay.frameOf(pub("room", 2), false, 2_000)).toBe(JSON.stringify(pub("room", 2)));
    replay.watch("room", 2_001);
    expect(replay.cursor("room")).toMatchObject({ seq: 0 });
    expect(replay.cursor("room")?.epoch).not.toBe(before?.epoch);
  });

  test("counts a room's retention from its last subscriber leaving, however long it sat quiet before", () => {
    const replay = new RoomReplay({ vouches: true, retainMs: 1_000 });
    replay.watch("room", 0);
    replay.left("room", 5_000);
    expect(JSON.parse(replay.frameOf(pub("room", 1), false, 5_500))).toMatchObject({ seq: 1 });
  });

  test("drops an idle room once its retention ran out, with no publish to it to notice", () => {
    const replay = new RoomReplay({ vouches: true, retainMs: 1_000 });
    replay.watch("idle", 0);
    replay.frameOf(pub("idle", 1), true, 1);
    replay.left("idle", 2);
    replay.watch("busy", 5_000);
    expect(replay.cursor("idle")).toBeNull();
    expect(replay.cursor("busy")).not.toBeNull();
  });

  test("never drops a room a socket here still subscribes to, so its numbering never restarts under it", () => {
    const held = new Set(["held"]);
    const replay = new RoomReplay({ vouches: true, rooms: 2, subscribed: (roomId) => held.has(roomId) });
    replay.watch("held", 0);
    for (const n of [1, 2, 3]) replay.frameOf(pub("held", n), true, n);
    for (const roomId of ["a", "b", "c"]) replay.watch(roomId, 10);
    expect(replay.cursor("a")).toBeNull();
    expect(replay.cursor("b")).toBeNull();
    replay.watch("held", 20);
    expect(JSON.parse(replay.frameOf(pub("held", 4), true, 21))).toMatchObject({ seq: 4 });
  });

  test("vouches for no cursor taken before a frame that went out unnumbered", () => {
    const replay = new RoomReplay({ vouches: true });
    replay.watch("room");
    const cursor = replay.cursor("room");
    if (!cursor) throw new Error("watched room has no cursor");
    replay.frameOf(pub("room", 1), true);
    replay.unnumbered("room");
    replay.frameOf(pub("room", 2), true);
    expect(replay.since("room", { epoch: cursor.epoch, seq: 1 })).toBeNull();
    expect(replay.since("room", { epoch: cursor.epoch, seq: 2 })).toEqual([]);
  });

  test("vouches only as a lone process on the in-process adaptor", () => {
    const solid = Object.create(SolidPubSub.prototype) as WebsocketAdaptor;
    const redis = Object.create(WebSocketRedisAdaptor.prototype) as WebsocketAdaptor;
    expect(RoomReplay.vouchesFor(solid, true)).toBe(true);
    expect(RoomReplay.vouchesFor(solid, false)).toBe(false);
    expect(RoomReplay.vouchesFor(redis, true)).toBe(false);
  });
});

describe("RoomReplay over a real socket", () => {
  test("a WsClient that lost its socket gets what was published meanwhile, in order, without a resync", async () => {
    const { WsClient } = await import("akanjs/fetch");
    const replay = new RoomReplay({ vouches: true });
    const sockets = new Set<Bun.ServerWebSocket<unknown>>();
    const server = Bun.serve({
      port: 0,
      fetch: (req, srv) => (srv.upgrade(req) ? undefined : new Response("no")),
      websocket: {
        open: (ws) => void sockets.add(ws),
        close: (ws) => void sockets.delete(ws),
        message: (ws, message) => {
          const { key, data, since } = JSON.parse(String(message)) as {
            key: string;
            data: string[];
            since?: { epoch: string; seq: number };
          };
          if (key === "__heartbeat" || key === "__auth") return;
          const roomId = `${key}-${data[0]}`;
          replay.watch(roomId);
          ws.subscribe(roomId);
          const missed = since ? replay.since(roomId, since) : null;
          for (const frame of missed ?? []) ws.send(frame);
          const cursor = replay.cursor(roomId);
          ws.send(
            JSON.stringify({
              type: "sub",
              roomId,
              requestRoomId: roomId,
              subscribe: true,
              ...(cursor ? { cursor } : {}),
              ...(since ? { replayed: !!missed } : {}),
            }),
          );
        },
      },
    });
    const roomId = "commandOfPc-pc-7";
    const publish = (n: number) =>
      server.publish(roomId, replay.frameOf({ type: "pub", roomId, data: { n } }, server.subscriberCount(roomId) > 0));

    //? Long enough that the publishes below land while the client is away, never after it resubscribed.
    const client = new WsClient(`ws://localhost:${server.port}/`).configure({ reconnect: { min: 300, jitter: 0 } });
    const received: unknown[] = [];
    let resyncs = 0;
    client.subscribe({
      key: "commandOfPc",
      data: ["pc-7"],
      handleEvent: (event) => received.push(event),
      handleResync: () => {
        resyncs += 1;
      },
    });
    client.connect();
    try {
      await until(() => server.subscriberCount(roomId) > 0);
      publish(1);
      publish(2);
      await until(() => received.length === 2);
      for (const ws of sockets) ws.close();
      await until(() => server.subscriberCount(roomId) === 0);
      publish(3);
      publish(4);
      await until(() => received.length === 4);
      publish(5);
      await until(() => received.length === 5);
      expect(received).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }]);
      expect(resyncs).toBe(0);
    } finally {
      client.destroy();
      server.stop(true);
    }
  });
});

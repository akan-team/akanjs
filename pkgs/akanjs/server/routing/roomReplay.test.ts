import { describe, expect, test } from "bun:test";
import { RoomReplay } from "./roomReplay";

const pub = (roomId: string, n: number) => ({ type: "pub" as const, roomId, data: { n } });

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
    for (const n of [1, 2, 3, 4, 5]) replay.frameOf(pub("room", n), true);
    const cursor = replay.cursor("room");
    if (!cursor) throw new Error("watched room has no cursor");
    expect(replay.since("room", { epoch: cursor.epoch, seq: 3 })?.map((frame) => JSON.parse(frame).seq)).toEqual([
      4, 5,
    ]);
    expect(replay.since("room", { epoch: cursor.epoch, seq: 5 })).toEqual([]);
    expect(replay.since("room", { epoch: cursor.epoch, seq: 1 })).toBeNull();
    expect(replay.since("room", { epoch: "another", seq: 3 })).toBeNull();
    expect(replay.since("room", { epoch: cursor.epoch, seq: 9 })).toBeNull();
    expect(new RoomReplay({ vouches: false }).since("room", { epoch: cursor.epoch, seq: 3 })).toBeNull();
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
    const publish = (n: number) =>
      server.publish(
        "commandOfPc-pc-7",
        replay.frameOf(
          { type: "pub", roomId: "commandOfPc-pc-7", data: { n } },
          server.subscriberCount("commandOfPc-pc-7") > 0,
        ),
      );

    const client = new WsClient(`ws://localhost:${server.port}/`).configure({ reconnect: { min: 20, jitter: 0 } });
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
      await Bun.sleep(50);
      publish(1);
      publish(2);
      await Bun.sleep(30);
      for (const ws of sockets) ws.close();
      await Bun.sleep(5);
      publish(3);
      publish(4);
      await Bun.sleep(150);
      publish(5);
      await Bun.sleep(30);
      expect(received).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }]);
      expect(resyncs).toBe(0);
    } finally {
      client.destroy();
      server.stop(true);
    }
  });
});

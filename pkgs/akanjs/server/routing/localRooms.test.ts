import { describe, expect, test } from "bun:test";
import { BinaryPubsub } from "../binaryPubsub";
import { localRoomsOf } from "./localRooms";
import { RoomReplay } from "./roomReplay";

const until = async (condition: () => boolean, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the socket");
    await Bun.sleep(2);
  }
};

describe("localRoomsOf", () => {
  const fakeServer = () => {
    const sent: { roomId: string; frame: unknown }[] = [];
    const server = { publish: (roomId: string, frame: unknown) => sent.push({ roomId, frame }) };
    return { sent, server: server as unknown as Bun.Server<never> };
  };

  test("numbers a room's JSON frames and its resync in one sequence, on every server it listens on", () => {
    const [http, ws] = [fakeServer(), fakeServer()];
    const replay = new RoomReplay({ vouches: false });
    replay.watch("chat");
    const rooms = localRoomsOf({
      servers: [http.server, null, ws.server],
      replay,
      binary: new BinaryPubsub(),
      subscribed: () => true,
      coalesces: () => false,
    });
    rooms.publish("chat", { n: 1 });
    rooms.resync("chat");
    const frames = http.sent.map(({ frame }) => JSON.parse(String(frame)) as unknown);
    expect(frames).toEqual([
      { type: "pub", roomId: "chat", data: { n: 1 }, seq: 1 },
      { type: "resync", roomId: "chat", seq: 2 },
    ]);
    expect(ws.sent).toEqual(http.sent);
  });

  test("hands a binary frame to the binary pub/sub unnumbered, coalescing it where the room does", () => {
    const replay = new RoomReplay({ vouches: true });
    replay.watch("cam");
    const cursor = replay.cursor("cam");
    const published: { roomId: string; coalesce?: boolean }[] = [];
    const binary = Object.assign(new BinaryPubsub(), {
      publish: (roomId: string, _frame: Uint8Array, option?: { coalesce?: boolean }) =>
        published.push({ roomId, coalesce: option?.coalesce }),
    });
    const rooms = localRoomsOf({
      servers: [],
      replay,
      binary,
      subscribed: () => true,
      coalesces: (roomId) => roomId === "cam",
    });
    rooms.publish("cam", new Uint8Array([1, 2]));
    expect(published).toEqual([{ roomId: "cam", coalesce: true }]);
    if (!cursor) throw new Error("watched room has no cursor");
    expect(replay.since("cam", cursor)).toBeNull();
  });
});

describe("localRoomsOf over a real socket", () => {
  test("tells a WsClient's room to resync without a hole in its numbering, and only that room", async () => {
    const { WsClient } = await import("akanjs/fetch");
    const server = Bun.serve({
      port: 0,
      fetch: (req, srv) => (srv.upgrade(req) ? undefined : new Response("no")),
      websocket: {
        message: (ws, message) => {
          const { key, data } = JSON.parse(String(message)) as { key: string; data: string[] };
          if (key === "__heartbeat" || key === "__auth") return;
          const roomId = `${key}-${data[0]}`;
          replay.watch(roomId);
          ws.subscribe(roomId);
          const cursor = replay.cursor(roomId);
          ws.send(JSON.stringify({ type: "sub", roomId, requestRoomId: roomId, subscribe: true, cursor }));
        },
      },
    });
    const subscribed = (roomId: string) => server.subscriberCount(roomId) > 0;
    const replay = new RoomReplay({ vouches: false, subscribed });
    const rooms = localRoomsOf({
      servers: [server as Bun.Server<never>],
      replay,
      binary: new BinaryPubsub(),
      subscribed,
      coalesces: () => false,
    });
    const client = new WsClient(`ws://localhost:${server.port}/`);
    const received: unknown[] = [];
    const resyncs = { chat: 0, other: 0 };
    const subscribe = (room: keyof typeof resyncs) =>
      client.subscribe({
        key: "roomChat",
        data: [room],
        handleEvent: (event) => received.push(event),
        handleResync: () => {
          resyncs[room] += 1;
        },
      });
    subscribe("chat");
    subscribe("other");
    client.connect();
    try {
      await until(() => subscribed("roomChat-chat") && subscribed("roomChat-other"));
      rooms.publish("roomChat-chat", { n: 1 });
      rooms.resync("roomChat-chat");
      rooms.publish("roomChat-chat", { n: 2 });
      await until(() => received.length === 2);
      expect(received).toEqual([{ n: 1 }, { n: 2 }]);
      expect(resyncs).toEqual({ chat: 1, other: 0 });
      //? A resync dropped under backpressure: its number is taken, so the next frame shows the hole.
      replay.frameOf({ type: "resync", roomId: "roomChat-other" }, true);
      rooms.publish("roomChat-other", { n: 3 });
      await until(() => resyncs.other === 1);
    } finally {
      client.destroy();
      server.stop(true);
    }
  });
});

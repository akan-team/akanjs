import { describe, expect, test } from "bun:test";
import { websocketBinaryFrameContract } from "akanjs/common";
import { WsClient } from "../fetch/client/wsClient";
import { BinaryPubsub } from "./binaryPubsub";

/** Stands in for `Bun.Server.publish`, whose contract is `-1` backpressured, `0` no subscriber, bytes otherwise. */
class FakeServer {
  status = 1;
  readonly published: { roomId: string; bytes: number }[] = [];
  publish(roomId: string, frame: Uint8Array) {
    this.published.push({ roomId, bytes: frame.length });
    return this.status === 1 ? frame.length : this.status;
  }
}

const withServer = () => {
  const server = new FakeServer();
  const pubsub = new BinaryPubsub();
  pubsub.setServers(server as unknown as Bun.Server<never>);
  return { server, pubsub };
};

describe("BinaryPubsub", () => {
  test("publishes straight through while the socket keeps up", () => {
    const { server, pubsub } = withServer();

    pubsub.publish("room", new Uint8Array([1]));
    pubsub.publish("room", new Uint8Array([2]));
    pubsub.flush();

    expect(server.published.length).toBe(2);
    expect(pubsub.coalescedCount).toBe(0);
  });

  test("keeps only the newest frame per room while backpressured, and sends it on drain", () => {
    const { server, pubsub } = withServer();
    server.status = -1;

    pubsub.publish("room", new Uint8Array([1]), { coalesce: true });
    pubsub.publish("room", new Uint8Array([2, 2]), { coalesce: true });
    pubsub.publish("room", new Uint8Array([3, 3, 3]), { coalesce: true });

    expect(pubsub.coalescedCount).toBe(2);

    server.status = 1;
    server.published.length = 0;
    pubsub.flush();

    expect(server.published).toEqual([{ roomId: "room", bytes: 3 }]);
  });

  test("parks each room separately, so a slow room does not swallow another", () => {
    const { server, pubsub } = withServer();
    server.status = -1;

    pubsub.publish("roomA", new Uint8Array([1]), { coalesce: true });
    pubsub.publish("roomB", new Uint8Array([2, 2]), { coalesce: true });

    expect(pubsub.coalescedCount).toBe(0);

    server.status = 1;
    server.published.length = 0;
    pubsub.flush();

    expect(server.published.map((entry) => entry.roomId).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "roomA",
      "roomB",
    ]);
  });

  test("re-parks a frame that is still backpressured without counting a drop", () => {
    const { server, pubsub } = withServer();
    server.status = -1;

    pubsub.publish("room", new Uint8Array([1]), { coalesce: true });
    pubsub.flush();
    pubsub.flush();

    expect(pubsub.coalescedCount).toBe(0);

    server.status = 1;
    server.published.length = 0;
    pubsub.flush();

    expect(server.published).toEqual([{ roomId: "room", bytes: 1 }]);
  });

  test("parks nothing for a room with no subscriber, so a dead room cannot grow the map", () => {
    const { server, pubsub } = withServer();
    server.status = 0;

    pubsub.publish("room", new Uint8Array([1]), { coalesce: true });
    server.published.length = 0;
    pubsub.flush();

    expect(server.published).toEqual([]);
  });

  test("drops a parked frame once its room loses every subscriber", () => {
    const { server, pubsub } = withServer();
    server.status = -1;
    pubsub.publish("room", new Uint8Array([1]), { coalesce: true });

    server.status = 0;
    pubsub.flush();
    server.published.length = 0;
    pubsub.flush();

    expect(server.published).toEqual([]);
  });

  test("queues by default, so only a room whose endpoint declared it may drop frames", () => {
    const { server, pubsub } = withServer();
    server.status = -1;

    pubsub.publish("room", new Uint8Array([1]));
    pubsub.publish("room", new Uint8Array([2]));

    expect(server.published.length).toBe(2);
    expect(pubsub.coalescedCount).toBe(0);

    server.status = 1;
    server.published.length = 0;
    pubsub.flush();

    expect(server.published).toEqual([]);
  });

  test("keeps publishing after one server throws", () => {
    const healthy = new FakeServer();
    const broken = {
      publish: () => {
        throw new Error("closed");
      },
    };
    const pubsub = new BinaryPubsub();
    pubsub.setServers(broken as unknown as Bun.Server<never>, healthy as unknown as Bun.Server<never>);

    pubsub.publish("room", new Uint8Array([1]));

    expect(healthy.published).toEqual([{ roomId: "room", bytes: 1 }]);
  });
});

/**
 * The one hop both suites above fake on either side: a real Bun socket carrying a real frame into a real
 * `WsClient`. Browsers deliver a binary frame as a Blob unless `binaryType` is set, so this is what proves
 * the bytes arrive synchronously and in the same room the JSON protocol would have used.
 */
describe("BinaryPubsub over a real socket", () => {
  test("delivers published bytes to a subscribed WsClient, alongside a JSON frame on the same socket", async () => {
    const pubsub = new BinaryPubsub();
    const server = Bun.serve({
      port: 0,
      fetch: (req, srv) => (srv.upgrade(req) ? undefined : new Response("no")),
      websocket: {
        drain: () => pubsub.flush(),
        open: (ws) => {
          ws.subscribe("stream-ch1");
        },
        message: () => undefined,
      },
    });
    pubsub.setServers(server as unknown as Bun.Server<never>);

    const client = new WsClient(`ws://localhost:${server.port}/`);
    const received: unknown[] = [];
    client.subscribe({ key: "stream", data: ["ch1"], handleEvent: (data) => received.push(data) });
    client.connect();
    await Bun.sleep(50);

    pubsub.publish(
      "stream-ch1",
      websocketBinaryFrameContract.encode({ roomId: "stream-ch1", payload: new Uint8Array([2, 148, 1, 2, 63]) }),
    );
    server.publish("stream-ch1", JSON.stringify({ type: "pub", roomId: "stream-ch1", data: { title: "json" } }));
    await Bun.sleep(50);

    expect(received[0]).toBeInstanceOf(Uint8Array);
    expect([...(received[0] as Uint8Array)]).toEqual([2, 148, 1, 2, 63]);
    expect(received[1]).toEqual({ title: "json" });

    client.destroy();
    server.stop(true);
  });
});

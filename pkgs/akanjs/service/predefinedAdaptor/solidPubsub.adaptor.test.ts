import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { INJECT_META } from "akanjs/base";
import type { InjectInfo } from "../injectInfo";
import { SolidPubSub } from "./solidPubsub.adaptor";
import type { LiveChange } from "./websocket.adaptor";

// A replica behind the gateway: what it hands the gateway, and what it does with what the gateway hands it.
describe("SolidPubSub", () => {
  let pubsub: SolidPubSub;
  const sent: unknown[] = [];
  const originalSend = process.send;

  beforeEach(async () => {
    process.send = ((message: unknown) => sent.push(message) > 0) as typeof process.send;
    pubsub = new SolidPubSub();
    Object.assign(pubsub, { serverId: "replica-0" });
    await pubsub.onInit();
  });
  afterEach(async () => {
    await pubsub.onDestroy();
    process.send = originalSend;
    sent.length = 0;
  });

  test("hands a committed write to the gateway and routes one another replica made", () => {
    const change: LiveChange = { refName: "ticket", next: `{"id":"a"}` };
    pubsub.publishChange(change);
    expect(sent).toEqual([{ type: "live.change", change, origin: "replica-0" }]);

    const routed: LiveChange[] = [];
    pubsub.onChange((received) => routed.push(received));
    process.emit("message", { type: "live.change", change, origin: "replica-1" });
    process.emit("message", { type: "live.change", change, origin: "replica-0" });
    expect(routed).toEqual([change]);
  });

  test("delivers a room event another replica published once", () => {
    const delivered: unknown[] = [];
    pubsub.setEventHandler((roomId, data) => delivered.push([roomId, data]));
    process.emit("message", { type: "pubsub.deliver", roomId: "room-1", data: { n: 1 }, origin: "replica-1" });
    expect(delivered).toEqual([["room-1", { n: 1 }]]);
  });

  const settledFlag = (promise: Promise<unknown>) => {
    const flag = { settled: false };
    void promise.then(() => {
      flag.settled = true;
    });
    return flag;
  };
  const ticks = async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  };
  const newSocket = () => ({ data: {} }) as Bun.ServerWebSocket<unknown>;

  test("resolves a join behind the gateway once the gateway answers its subscribe", async () => {
    Object.assign(pubsub, { behindGateway: true });
    const first = settledFlag(pubsub.joinRoom(newSocket(), "room-1"));
    const second = settledFlag(pubsub.joinRoom(newSocket(), "room-2"));
    expect(sent).toMatchObject([
      { type: "pubsub.subscribe", roomId: "room-1", ack: 1 },
      { type: "pubsub.subscribe", roomId: "room-2", ack: 2 },
    ]);
    process.emit("message", { type: "pubsub.subscribed", ack: 2 });
    await ticks();
    expect([first.settled, second.settled]).toEqual([false, true]);
    process.emit("message", { type: "pubsub.subscribed", ack: 1 });
    await ticks();
    expect(first.settled).toBe(true);
  });

  test("waits only as a gateway child: a solo server has a replica index too, but no gateway socket", () => {
    const { behindGateway } = SolidPubSub[INJECT_META] as { behindGateway: InjectInfo<"env"> };
    const saved = { ...process.env };
    try {
      process.env.AKAN_REPLICA_IDX = "0";
      delete process.env.AKAN_CHILD_SOCKET;
      expect(behindGateway.generateFactory({})).toBe(false);
      process.env.AKAN_CHILD_SOCKET = "/tmp/akan-child-0.sock";
      expect(behindGateway.generateFactory({})).toBe(true);
    } finally {
      process.env = saved;
    }
  });

  test("does not wait for an answer where no gateway gives one", async () => {
    await pubsub.joinRoom(newSocket(), "room-1");
    expect(sent).toEqual([
      { type: "pubsub.subscribe", roomId: "room-1", socketId: expect.any(String), pid: process.pid },
    ]);
  });

  test("stops waiting after 3 s for a gateway that does not answer, and at once on shutdown", async () => {
    Object.assign(pubsub, { behindGateway: true });
    jest.useFakeTimers();
    try {
      const lagging = settledFlag(pubsub.joinRoom(newSocket(), "room-1"));
      jest.advanceTimersByTime(2_999);
      await ticks();
      expect(lagging.settled).toBe(false);
      jest.advanceTimersByTime(1);
      await ticks();
      expect(lagging.settled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
    const pending = settledFlag(pubsub.joinRoom(newSocket(), "room-2"));
    await pubsub.onDestroy();
    await ticks();
    expect(pending.settled).toBe(true);
  });

  test("reports its live models to the gateway, and again in every room snapshot", () => {
    pubsub.reportLiveModels(["ticket"]);
    process.emit("message", { type: "pubsub.snapshot.request" });
    expect(sent).toEqual([
      { type: "live.models", models: ["ticket"], pid: process.pid },
      { type: "pubsub.snapshot", rooms: [], liveModels: ["ticket"], pid: process.pid },
    ]);
  });
});

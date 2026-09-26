import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
});

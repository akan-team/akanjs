import { describe, expect, test } from "bun:test";
import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";

import type { YjsRelayTransport } from "./useYjsRelay";
import { YjsRelayRoom } from "./yjsRelayRoom";

const relayOf = () => {
  const calls: string[] = [];
  const listeners = new Set<(frame: Uint8Array) => void>();
  const answer = Promise.withResolvers<{ state: string; seed: boolean }>();
  const transport: YjsRelayTransport = {
    join: async (id) => {
      calls.push(`join:${id}`);
      return await answer.promise;
    },
    push: () => {},
    subscribe: (id, onFrame) => {
      calls.push(`subscribe:${id}`);
      listeners.add(onFrame);
      return () => {
        calls.push(`unsubscribe:${id}`);
        listeners.delete(onFrame);
      };
    },
  };
  const relay = (frame: Uint8Array) => {
    for (const listener of listeners) listener(frame);
  };
  return { calls, listeners, answer, transport, relay };
};

describe("YjsRelayRoom", () => {
  test("subscribes to the room before it asks for the join", async () => {
    const { calls, answer, transport } = relayOf();
    const room = new YjsRelayRoom("page", transport);
    const joining = room.join();
    expect(calls).toEqual(["subscribe:page", "join:page"]);
    answer.resolve({ state: "", seed: true });
    expect(await joining).toEqual({ state: "", seed: true });
    room.close();
  });

  test("holds what the room relays until a provider attaches, then replays it ahead of live frames", async () => {
    const { answer, transport, relay } = relayOf();
    const room = new YjsRelayRoom("page", transport);
    const joining = room.join();
    relay(new Uint8Array([1]));
    answer.resolve({ state: "", seed: false });
    await joining;
    relay(new Uint8Array([2]));

    const received: number[] = [];
    room.attach((frame) => {
      received.push(frame[0]);
    });
    relay(new Uint8Array([3]));
    expect(received).toEqual([1, 2, 3]);
    room.close();
  });

  test("a document started from a stale join state gains the edits relayed while the join was in flight", async () => {
    const { answer, transport, relay } = relayOf();
    const author = new Doc();
    author.getText("root").insert(0, "alpha");
    const stale = Buffer.from(encodeStateAsUpdate(author)).toString("base64");
    author.on("update", (update: Uint8Array) => {
      relay(update);
    });

    const room = new YjsRelayRoom("page", transport);
    const joining = room.join();
    author.getText("root").insert(5, " beta");
    answer.resolve({ state: stale, seed: false });
    const { state } = await joining;

    const joiner = new Doc();
    applyUpdate(joiner, Uint8Array.from(Buffer.from(state, "base64")));
    room.attach((frame) => {
      applyUpdate(joiner, frame);
    });
    expect(joiner.getText("root").toString()).toBe("alpha beta");
    room.close();
  });

  test("a reconnect after close subscribes once more and hands each frame to the new consumer only", () => {
    const { calls, listeners, transport, relay } = relayOf();
    const room = new YjsRelayRoom("page", transport);
    const first: number[] = [];
    const second: number[] = [];
    room.attach((frame) => {
      first.push(frame[0]);
    });
    room.close();
    room.attach((frame) => {
      second.push(frame[0]);
    });
    relay(new Uint8Array([7]));
    expect(listeners.size).toBe(1);
    expect(first).toEqual([]);
    expect(second).toEqual([7]);
    expect(calls).toEqual(["subscribe:page", "unsubscribe:page", "subscribe:page"]);
    room.close();
  });

  test("closing before the join returns unsubscribes once and drops what was held", async () => {
    const { calls, listeners, answer, transport, relay } = relayOf();
    const room = new YjsRelayRoom("page", transport);
    const joining = room.join();
    relay(new Uint8Array([1]));
    room.close();
    room.close();
    expect(listeners.size).toBe(0);
    expect(calls).toEqual(["subscribe:page", "join:page", "unsubscribe:page"]);

    answer.resolve({ state: "", seed: false });
    await joining;
    const received: number[] = [];
    room.attach((frame) => {
      received.push(frame[0]);
    });
    expect(received).toEqual([]);
    room.close();
  });
});

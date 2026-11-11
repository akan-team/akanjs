import { describe, expect, test } from "bun:test";
import type { Logger } from "akanjs/common";
import type { BuilderMessage, BuilderResponse } from "akanjs/server";
import type { IncrementalBuilderHost } from "../incrementalBuilder";
import { BuilderRequestRelay } from "./builderRequestRelay";

const logger = { verbose: () => undefined, warn: () => undefined } as unknown as Logger;

const graphRequest = (id: number) => ({ type: "build-graph", id }) as BuilderMessage;

const graphAnswer = (id: number, error: string) =>
  ({ type: "build-graph-res", id, ok: false, error, kind: "unavailable" }) as BuilderResponse;

const relayWith = ({ status = "ready", accepts = true }: { status?: string; accepts?: boolean } = {}) => {
  const sent: BuilderMessage[] = [];
  const answered: BuilderMessage[] = [];
  const wakes: string[] = [];
  const state = { away: false, activity: 0 };
  const builder = {
    status,
    send: (message: BuilderMessage) => {
      if (accepts) sent.push(message);
      return accepts;
    },
  } as unknown as IncrementalBuilderHost;
  const relay = new BuilderRequestRelay(
    { logger, env: {} },
    {
      builder: () => builder,
      toBackend: (message) => answered.push(message),
      markActivity: () => {
        state.activity += 1;
      },
      away: () => state.away,
      wake: (reason) => wakes.push(reason),
    },
  );
  return { relay, sent, answered, wakes, state };
};

describe("BuilderRequestRelay", () => {
  test("renumbers a request, and settles its answer under the backend's own id", () => {
    const { relay, sent } = relayWith();
    relay.startGeneration();
    relay.send(graphRequest(1));
    relay.send(graphRequest(1));
    const [first, second] = sent as { id: number }[];
    expect(first.id).not.toBe(second.id);
    expect(relay.settle(graphAnswer(second.id, "answer"))).toEqual(graphAnswer(1, "answer"));
  });

  test("a new generation drops the old one's answers", () => {
    const { relay, sent } = relayWith();
    relay.startGeneration();
    relay.send(graphRequest(1));
    relay.startGeneration();
    expect(relay.settle(graphAnswer((sent[0] as { id: number }).id, "stale"))).toBeNull();
  });

  test("holds a request while the builder is away, wakes it, and replays it on flush", () => {
    const { relay, sent, wakes, state } = relayWith();
    state.away = true;
    relay.send(graphRequest(4));
    expect(sent).toEqual([]);
    expect(wakes).toEqual(["build-graph arrived while suspended"]);
    expect(state.activity).toBe(1);
    state.away = false;
    relay.flush();
    expect(sent).toHaveLength(1);
  });

  test("discards held requests unanswered, and fails them with an answer", () => {
    const { relay, sent, answered, state } = relayWith();
    state.away = true;
    relay.send(graphRequest(4));
    relay.discard("the backend restarted");
    state.away = false;
    relay.flush();
    expect(sent).toEqual([]);
    expect(answered).toEqual([]);

    state.away = true;
    relay.send(graphRequest(5));
    relay.fail("builder failed to start");
    expect(answered).toEqual([graphAnswer(5, "builder failed to start")]);
  });

  test("answers a request no builder took under the backend's own id", () => {
    const { relay, answered } = relayWith({ status: "stopped", accepts: false });
    relay.send(graphRequest(9));
    expect(answered).toEqual([graphAnswer(9, "builder is stopped; reload after the builder is ready")]);
  });
});

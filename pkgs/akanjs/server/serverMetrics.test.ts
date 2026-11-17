import { describe, expect, test } from "bun:test";
import type { AkanMetricFamily } from "akanjs/service";
import type { AkanServer } from "./akanServer";
import type { ServerListener } from "./routing/serverListener";
import { ServerMetrics } from "./serverMetrics";

const owner = { serverMode: "all" } as unknown as Pick<AkanServer, "logger" | "serverMode">;
const listenerOf = (replayBytes: number, pubsubBufferedCount: number | undefined, liveRoomCount = 0) =>
  ({ coalescedCount: 0, replayBytes, pubsubBufferedCount, liveRoomCount }) as unknown as ServerListener;
const sampleOf = (families: AkanMetricFamily[], name: string) => {
  const family = families.find((entry) => entry.name === name);
  return family?.samples.map((sample) => ("value" in sample ? [sample.value, sample.labels] : null));
};

describe("ServerMetrics", () => {
  test("exposes the replay bytes and the Redis buffer depth as one gauge each, labelled by role alone", () => {
    const families = new ServerMetrics(owner, listenerOf(4_096, 7), () => null).families();
    expect(sampleOf(families, "akan_room_replay_bytes")).toEqual([[4_096, { role: "all" }]]);
    expect(sampleOf(families, "akan_pubsub_buffered_messages")).toEqual([[7, { role: "all" }]]);

    const inProcess = new ServerMetrics(owner, listenerOf(0, undefined), () => null).families();
    expect(sampleOf(inProcess, "akan_pubsub_buffered_messages")).toEqual([[0, { role: "all" }]]);
  });

  test("exposes the live rooms this process holds as one gauge labelled by role alone", () => {
    const families = new ServerMetrics(owner, listenerOf(0, 0, 5), () => null).families();
    expect(sampleOf(families, "akan_live_rooms")).toEqual([[5, { role: "all" }]]);
  });

  test("puts all three in the metrics report next to the process sample", async () => {
    const metrics = new ServerMetrics(owner, listenerOf(512, 3, 2), () => null);
    metrics.start();
    try {
      const deadline = Date.now() + 2_000;
      while (metrics.last.replayBytes === undefined && Date.now() < deadline) await Bun.sleep(5);
      expect(metrics.last).toMatchObject({ role: "all", replayBytes: 512, pubsubBufferedCount: 3, roomCount: 2 });
    } finally {
      metrics.stop();
    }
  });
});

import { metricRegistry } from "./metricRegistry";

export interface PubsubDepth {
  replayBytes: number;
  bufferedCount: number | undefined;
}

const replayBytes = metricRegistry.gauge(
  "akan_room_replay_bytes",
  "Frame bytes kept across every room to send a reconnecting socket what it missed, at most 64 MiB a process.",
);
const bufferedPublishes = metricRegistry.gauge(
  "akan_pubsub_buffered_messages",
  "Publishes waiting for the Redis link to take them; past 10,000 the oldest is dropped.",
);

export const setPubsubGauges = (depth: PubsubDepth) => {
  replayBytes.set(depth.replayBytes);
  bufferedPublishes.set(depth.bufferedCount ?? 0);
};

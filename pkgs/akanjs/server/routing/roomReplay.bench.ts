import { RoomReplay } from "./roomReplay";

const payload = { op: "update", id: "a".repeat(24), light: { title: "x".repeat(480), status: "open", n: 0 } };

const replayOf = (rooms: number, held: boolean) => {
  const replay = new RoomReplay({ vouches: true, subscribed: () => held });
  for (let idx = 0; idx < rooms; idx += 1) replay.watch(`room-${idx}`, 0);
  return replay;
};

const microsPerPublish = (rooms: number, publishes: number) => {
  const replay = replayOf(rooms, true);
  const run = (count: number) => {
    for (let idx = 0; idx < count; idx += 1) {
      const roomId = `room-${(idx * 7919) % rooms}`;
      replay.frameOf({ type: "pub", roomId, data: payload }, true, 1 + idx);
    }
  };
  run(Math.min(publishes, 1_000));
  const startedAt = performance.now();
  run(publishes);
  return ((performance.now() - startedAt) * 1000) / publishes;
};

const heapAfterFilling = (rooms: number, depth: number) => {
  Bun.gc(true);
  const before = process.memoryUsage().heapUsed;
  const replay = replayOf(rooms, true);
  for (let round = 0; round < depth; round += 1)
    for (let idx = 0; idx < rooms; idx += 1)
      replay.frameOf({ type: "pub", roomId: `room-${idx}`, data: { ...payload, n: round } }, true, 1);
  Bun.gc(true);
  const used = process.memoryUsage().heapUsed - before;
  return { replay, mib: used / 1024 / 1024 };
};

//* macOS arm64, Bun 1.4.4. `before`: past the 10k-room cap every publish walked every subscribed room, and frames had
//* no budget; `after`: the cap evicts idle rooms only, and frames fit a 64 MiB budget.
const cases = [
  { rooms: 1_000, publishes: 50_000, before: 0.49, after: 0.45 },
  { rooms: 9_000, publishes: 50_000, before: 5.88, after: 0.6 },
  { rooms: 12_000, publishes: 5_000, before: 414, after: 0.5 },
  { rooms: 30_000, publishes: 2_000, before: 1_171, after: 0.6 },
];
const heap = { before: 866, after: 61 };

process.stdout.write(`RoomReplay — Bun ${Bun.version}, ${process.platform} ${process.arch}\n`);
for (const { rooms, publishes, before, after } of cases)
  process.stdout.write(
    `${String(rooms).padStart(6)} subscribed rooms  ${microsPerPublish(rooms, publishes).toFixed(2).padStart(9)} ` +
      `µs/publish  (baseline ${after}, was ${before})\n`,
  );
const { replay, mib } = heapAfterFilling(10_000, 128);
process.stdout.write(
  `10000 rooms × 128 frames  ${mib.toFixed(0).padStart(9)} MiB heap  (baseline ${heap.after}, was ${heap.before})\n`,
);
replay.forget("room-0");

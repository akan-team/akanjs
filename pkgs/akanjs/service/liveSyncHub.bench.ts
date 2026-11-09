import { createDocumentQueryHelper, type DocumentQuery } from "akanjs/document";
import { LiveSyncHub } from "./liveSyncHub";

const q = createDocumentQueryHelper();
const fields = { tags: { getProps: () => ({ isArray: true }) } };
const roomsPerOrg = 10;

type Shape = "plain" | "mixed" | "unindexed";

const queryOf = (shape: Shape, org: number, slot: number): DocumentQuery => {
  if (shape === "plain") return { org: `o${org}`, status: `s${slot}` };
  if (shape === "unindexed") return { priority: q.gte(slot) };
  if (slot % 2) return q.all({ org: `o${org}` }, { tags: q.has(`t${slot}`) });
  return { org: `o${org}`, status: q.oneOf([`s${slot}`, `s${slot + 1}`]) };
};

const hubOf = (shape: Shape, rooms: number) => {
  const hub = new LiveSyncHub();
  for (let idx = 0; idx < rooms; idx += 1) {
    const org = Math.floor(idx / roomsPerOrg);
    const slot = idx % roomsPerOrg;
    hub.join({ refName: "task", roomId: `r${idx}`, query: queryOf(shape, org, slot), fallback: null, fields });
  }
  return hub;
};

const docOf = (org: number, status: string) => ({
  id: "a".repeat(24),
  createdAt: 1000,
  updatedAt: 2000,
  org: `o${org}`,
  status,
  priority: 2,
  tags: ["t1", "t3"],
});

const microsPerWrite = (hub: LiveSyncHub, orgs: number, writes: number) => {
  const run = (count: number) => {
    let matched = 0;
    for (let idx = 0; idx < count; idx += 1) {
      const org = (idx * 7919) % orgs;
      matched += hub.route("task", docOf(org, "s3"), docOf(org, "s2")).length;
    }
    return matched;
  };
  run(Math.min(writes, 200));
  const startedAt = performance.now();
  const matched = run(writes);
  return { micros: ((performance.now() - startedAt) * 1000) / writes, matched: matched / writes };
};

//* µs per write on macOS arm64, Bun 1.4.4: `before` scanned every room of the model, `after` probes the equality index.
const cases: { shape: Shape; rooms: number; writes: number; before: number; after: number }[] = [
  { shape: "plain", rooms: 1_000, writes: 2_000, before: 26, after: 15 },
  { shape: "plain", rooms: 50_000, writes: 2_000, before: 1_700, after: 17 },
  { shape: "mixed", rooms: 1_000, writes: 2_000, before: 623, after: 17 },
  { shape: "mixed", rooms: 10_000, writes: 500, before: 6_728, after: 20 },
  { shape: "mixed", rooms: 50_000, writes: 200, before: 38_452, after: 30 },
  { shape: "unindexed", rooms: 10_000, writes: 200, before: 11_700, after: 10_500 },
];

process.stdout.write(`LiveSyncHub.route — Bun ${Bun.version}, ${process.platform} ${process.arch}\n`);
for (const { shape, rooms, writes, before, after } of cases) {
  const { micros, matched } = microsPerWrite(hubOf(shape, rooms), rooms / roomsPerOrg, writes);
  process.stdout.write(
    `${shape.padEnd(10)} ${String(rooms).padStart(6)} rooms  ${micros.toFixed(1).padStart(9)} µs/write  ` +
      `${matched.toFixed(1)} targets/write  (baseline ${after}, was ${before})\n`,
  );
}

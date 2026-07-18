/**
 * Deterministic seed dataset shared by every competitor server so that comparisons
 * run against identical data. Keep this side-effect free and dependency free.
 */

export interface BenchUser {
  id: string;
  name: string;
  email: string;
  orgId: string;
  createdAt: string;
  bio: string;
}

export interface BenchOrg {
  id: string;
  name: string;
}

const FIRST = ["Ada", "Linus", "Grace", "Alan", "Margaret", "Dennis", "Barbara", "Ken"];
const LAST = ["Lovelace", "Torvalds", "Hopper", "Turing", "Hamilton", "Ritchie", "Liskov", "Thompson"];

/** Build `userCount` users spread across `orgCount` orgs. Deterministic for a given size. */
export const buildDataset = (userCount = 10_000, orgCount = 50) => {
  const orgs: BenchOrg[] = Array.from({ length: orgCount }, (_, i) => ({
    id: `org_${i.toString().padStart(4, "0")}`,
    name: `Org ${i}`,
  }));
  const users: BenchUser[] = Array.from({ length: userCount }, (_, i) => {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i >> 3) % LAST.length];
    return {
      id: `usr_${i.toString().padStart(7, "0")}`,
      name: `${first} ${last} ${i}`,
      email: `user${i}@bench.local`,
      orgId: orgs[i % orgCount].id,
      createdAt: new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString(),
      bio: `Synthetic benchmark user #${i} used for read/write load tests.`,
    };
  });
  return { users, orgs };
};

/** A realistic-but-fixed payload for create/mutation load. */
export const sampleCreatePayload = (seq: number): Omit<BenchUser, "id" | "createdAt"> => ({
  name: `Created User ${seq}`,
  email: `created${seq}@bench.local`,
  orgId: `org_${(seq % 50).toString().padStart(4, "0")}`,
  bio: "Created during mutation load test.",
});

export const DATASET_SIZE = Number(process.env.BENCH_DATASET_SIZE ?? 10_000);

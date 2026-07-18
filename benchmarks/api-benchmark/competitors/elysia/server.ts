import { Elysia } from "elysia";
import { type BenchOrg, type BenchUser, buildDataset, DATASET_SIZE, sampleCreatePayload } from "../shared/dataset.ts";
import { signBenchToken, verifyBenchToken } from "../shared/jwt.ts";

/** Elysia (Bun-native) — the most direct framework peer to akanjs on the same runtime. */
const { users, orgs } = buildDataset(DATASET_SIZE);
const userById = new Map<string, BenchUser>(users.map((u) => [u.id, u]));
const orgById = new Map<string, BenchOrg>(orgs.map((o) => [o.id, o]));
let createSeq = 0;

const port = Number(process.env.PORT ?? 4002);

const requireAuth = async (authorization: string | undefined) => {
  const account = await verifyBenchToken(authorization);
  if (!account) throw new Error("unauthorized");
  return account;
};

new Elysia()
  .onError(({ error, set }) => {
    set.status = (error as Error).message === "unauthorized" ? 401 : 500;
    return { error: (error as Error).message };
  })
  .get("/ping", () => ({ ok: true }))
  .post("/login", async () => ({ token: await signBenchToken("usr_0000000") }))
  .get("/users", async ({ headers, query }) => {
    await requireAuth(headers.authorization);
    const limit = Number(query.limit ?? 20);
    const skip = Number(query.skip ?? 0);
    return users.slice(skip, skip + limit);
  })
  .post("/users", async ({ headers }) => {
    await requireAuth(headers.authorization);
    const body = sampleCreatePayload(createSeq++);
    const created: BenchUser = { ...body, id: `usr_new_${createSeq}`, createdAt: new Date().toISOString() };
    userById.set(created.id, created);
    return created;
  })
  .get("/users/:id", async ({ headers, params, set }) => {
    await requireAuth(headers.authorization);
    const user = userById.get(params.id);
    if (!user) {
      set.status = 404;
      return { error: "not found" };
    }
    return user;
  })
  .get("/users/:id/with-org", async ({ headers, params, set }) => {
    await requireAuth(headers.authorization);
    const user = userById.get(params.id);
    if (!user) {
      set.status = 404;
      return { error: "not found" };
    }
    return { ...user, org: orgById.get(user.orgId) ?? null };
  })
  .listen(port);

console.info(`[elysia] listening on :${port} (${users.length} users)`);

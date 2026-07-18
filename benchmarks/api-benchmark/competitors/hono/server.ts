import { Hono } from "hono";
import { type BenchOrg, type BenchUser, buildDataset, DATASET_SIZE, sampleCreatePayload } from "../shared/dataset.ts";
import { signBenchToken, verifyBenchToken } from "../shared/jwt.ts";

/** Hono (runtime-agnostic) running on Bun — lightweight framework peer. */
const { users, orgs } = buildDataset(DATASET_SIZE);
const userById = new Map<string, BenchUser>(users.map((u) => [u.id, u]));
const orgById = new Map<string, BenchOrg>(orgs.map((o) => [o.id, o]));
let createSeq = 0;

const port = Number(process.env.PORT ?? 4003);
const app = new Hono();

app.use("/users/*", async (c, next) => {
  if (!(await verifyBenchToken(c.req.header("authorization")))) return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.get("/ping", (c) => c.json({ ok: true }));
app.post("/login", async (c) => c.json({ token: await signBenchToken("usr_0000000") }));
app.get("/users", (c) => {
  const limit = Number(c.req.query("limit") ?? 20);
  const skip = Number(c.req.query("skip") ?? 0);
  return c.json(users.slice(skip, skip + limit));
});
app.post("/users", (c) => {
  const body = sampleCreatePayload(createSeq++);
  const created: BenchUser = { ...body, id: `usr_new_${createSeq}`, createdAt: new Date().toISOString() };
  userById.set(created.id, created);
  return c.json(created, 201);
});
app.get("/users/:id", (c) => {
  const user = userById.get(c.req.param("id"));
  return user ? c.json(user) : c.json({ error: "not found" }, 404);
});
app.get("/users/:id/with-org", (c) => {
  const user = userById.get(c.req.param("id"));
  if (!user) return c.json({ error: "not found" }, 404);
  return c.json({ ...user, org: orgById.get(user.orgId) ?? null });
});

Bun.serve({ port, fetch: app.fetch });
console.info(`[hono] listening on :${port} (${users.length} users)`);

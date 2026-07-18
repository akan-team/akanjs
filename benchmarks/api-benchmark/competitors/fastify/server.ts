import Fastify from "fastify";
import { type BenchOrg, type BenchUser, buildDataset, DATASET_SIZE, sampleCreatePayload } from "../shared/dataset.ts";
import { signBenchToken, verifyBenchToken } from "../shared/jwt.ts";

/**
 * Fastify (Node) — high-performance Node baseline.
 *
 * NOTE: this runs on Node, not Bun. Cross-runtime numbers are indicative only; see
 * README "Runtime caveat". Run with: `node --experimental-strip-types server.ts`
 * (Node 22+) or `bun server.ts`.
 */
const { users, orgs } = buildDataset(DATASET_SIZE);
const userById = new Map<string, BenchUser>(users.map((u) => [u.id, u]));
const orgById = new Map<string, BenchOrg>(orgs.map((o) => [o.id, o]));
let createSeq = 0;

const port = Number(process.env.PORT ?? 4004);
const app = Fastify({ logger: false });

app.addHook("preHandler", async (req, reply) => {
  if (!req.url.startsWith("/users")) return;
  if (!(await verifyBenchToken(req.headers.authorization))) {
    await reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/ping", async () => ({ ok: true }));
app.post("/login", async () => ({ token: await signBenchToken("usr_0000000") }));
app.get<{ Querystring: { limit?: string; skip?: string } }>("/users", async (req) => {
  const limit = Number(req.query.limit ?? 20);
  const skip = Number(req.query.skip ?? 0);
  return users.slice(skip, skip + limit);
});
app.post("/users", async (_req, reply) => {
  const body = sampleCreatePayload(createSeq++);
  const created: BenchUser = { ...body, id: `usr_new_${createSeq}`, createdAt: new Date().toISOString() };
  userById.set(created.id, created);
  return reply.code(201).send(created);
});
app.get<{ Params: { id: string } }>("/users/:id", async (req, reply) => {
  const user = userById.get(req.params.id);
  return user ? user : reply.code(404).send({ error: "not found" });
});
app.get<{ Params: { id: string } }>("/users/:id/with-org", async (req, reply) => {
  const user = userById.get(req.params.id);
  if (!user) return reply.code(404).send({ error: "not found" });
  return { ...user, org: orgById.get(user.orgId) ?? null };
});

await app.listen({ port, host: "0.0.0.0" });
console.info(`[fastify] listening on :${port} (${users.length} users)`);

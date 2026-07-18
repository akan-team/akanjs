import { Database } from "bun:sqlite";
import { buildDataset, DATASET_SIZE, sampleCreatePayload } from "../shared/dataset.ts";
import { signBenchToken, verifyBenchToken } from "../shared/jwt.ts";

/**
 * Raw bun:sqlite driver behind the same endpoints. This is the DB-layer ceiling:
 * akanjs's document store adds schema/hooks/DataLoader/serialization on top of this.
 */
const { users, orgs } = buildDataset(DATASET_SIZE);
const orgById = new Map(orgs.map((o) => [o.id, o]));

const db = new Database(":memory:");
db.exec("PRAGMA journal_mode = WAL");
db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, orgId TEXT, createdAt TEXT, bio TEXT)`);
db.exec("CREATE INDEX idx_users_org ON users(orgId)");
db.exec("CREATE INDEX idx_users_created ON users(createdAt)");
const insert = db.prepare("INSERT INTO users (id,name,email,orgId,createdAt,bio) VALUES (?,?,?,?,?,?)");
const insertMany = db.transaction((rows: typeof users) => {
  for (const u of rows) insert.run(u.id, u.name, u.email, u.orgId, u.createdAt, u.bio);
});
insertMany(users);

const findOne = db.prepare("SELECT * FROM users WHERE id = ?");
const listStmt = db.prepare("SELECT * FROM users ORDER BY createdAt DESC LIMIT ? OFFSET ?");
let createSeq = 0;

const port = Number(process.env.PORT ?? 4005);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

Bun.serve({
  port,
  routes: {
    "/ping": () => json({ ok: true }),
    "/login": { POST: async () => json({ token: await signBenchToken("usr_0000000") }) },
    "/users": {
      GET: async (req) => {
        if (!(await verifyBenchToken(req.headers.get("authorization")))) return json({ error: "unauthorized" }, 401);
        const url = new URL(req.url);
        const limit = Number(url.searchParams.get("limit") ?? 20);
        const skip = Number(url.searchParams.get("skip") ?? 0);
        return json(listStmt.all(limit, skip));
      },
      POST: async (req) => {
        if (!(await verifyBenchToken(req.headers.get("authorization")))) return json({ error: "unauthorized" }, 401);
        const body = sampleCreatePayload(createSeq++);
        const id = `usr_new_${createSeq}`;
        insert.run(id, body.name, body.email, body.orgId, new Date().toISOString(), body.bio);
        return json({ id, ...body }, 201);
      },
    },
    "/users/:id": async (req) => {
      if (!(await verifyBenchToken(req.headers.get("authorization")))) return json({ error: "unauthorized" }, 401);
      const user = findOne.get(req.params.id);
      return user ? json(user) : json({ error: "not found" }, 404);
    },
    "/users/:id/with-org": async (req) => {
      if (!(await verifyBenchToken(req.headers.get("authorization")))) return json({ error: "unauthorized" }, 401);
      const user = findOne.get(req.params.id) as { orgId: string } | null;
      if (!user) return json({ error: "not found" }, 404);
      return json({ ...user, org: orgById.get(user.orgId) ?? null });
    },
  },
  fetch: () => new Response("not found", { status: 404 }),
});

console.info(`[raw-sqlite] listening on :${port} (${users.length} users)`);

import { type BenchOrg, type BenchUser, buildDataset, DATASET_SIZE, sampleCreatePayload } from "../shared/dataset.ts";
import { signBenchToken, verifyBenchToken } from "../shared/jwt.ts";

/**
 * Baseline: native Bun.serve with no framework. Represents the routing + serialization
 * ceiling that any framework on Bun is measured against.
 */
const { users, orgs } = buildDataset(DATASET_SIZE);
const userById = new Map<string, BenchUser>(users.map((u) => [u.id, u]));
const orgById = new Map<string, BenchOrg>(orgs.map((o) => [o.id, o]));
let createSeq = 0;

const port = Number(process.env.PORT ?? 4001);
const roomSockets = new Map<string, Set<Bun.ServerWebSocket<unknown>>>();
const socketRooms = new WeakMap<Bun.ServerWebSocket<unknown>, Set<string>>();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const makeRoomId = (key: string, args: unknown[]) => `${key}${args.length ? "-" : ""}${args.join("-")}`;

const sendJson = (ws: Bun.ServerWebSocket<unknown>, data: unknown) => {
  ws.send(JSON.stringify(data));
};

const joinRoom = (ws: Bun.ServerWebSocket<unknown>, roomId: string) => {
  const sockets = roomSockets.get(roomId) ?? new Set<Bun.ServerWebSocket<unknown>>();
  sockets.add(ws);
  roomSockets.set(roomId, sockets);

  const rooms = socketRooms.get(ws) ?? new Set<string>();
  rooms.add(roomId);
  socketRooms.set(ws, rooms);
};

const leaveAllRooms = (ws: Bun.ServerWebSocket<unknown>) => {
  for (const roomId of socketRooms.get(ws) ?? []) {
    const sockets = roomSockets.get(roomId);
    sockets?.delete(ws);
    if (sockets?.size === 0) roomSockets.delete(roomId);
  }
  socketRooms.delete(ws);
};

const publishRoom = (roomId: string, data: object) => {
  const payload = JSON.stringify({ type: "pub", roomId, data });
  for (const ws of roomSockets.get(roomId) ?? []) ws.send(payload);
};

Bun.serve({
  port,
  routes: {
    "/ping": () => json({ ok: true }),
    "/login": {
      POST: async () => json({ token: await signBenchToken("usr_0000000") }),
    },
    "/users": {
      GET: async (req) => {
        if (!(await verifyBenchToken(req.headers.get("authorization")))) return json({ error: "unauthorized" }, 401);
        const url = new URL(req.url);
        const limit = Number(url.searchParams.get("limit") ?? 20);
        const skip = Number(url.searchParams.get("skip") ?? 0);
        return json(users.slice(skip, skip + limit));
      },
      POST: async (req) => {
        if (!(await verifyBenchToken(req.headers.get("authorization")))) return json({ error: "unauthorized" }, 401);
        const body = sampleCreatePayload(createSeq++);
        const created: BenchUser = { ...body, id: `usr_new_${createSeq}`, createdAt: new Date().toISOString() };
        userById.set(created.id, created);
        return json(created, 201);
      },
    },
    "/users/:id": async (req) => {
      if (!(await verifyBenchToken(req.headers.get("authorization")))) return json({ error: "unauthorized" }, 401);
      const user = userById.get(req.params.id);
      return user ? json(user) : json({ error: "not found" }, 404);
    },
    "/users/:id/with-org": async (req) => {
      if (!(await verifyBenchToken(req.headers.get("authorization")))) return json({ error: "unauthorized" }, 401);
      const user = userById.get(req.params.id);
      if (!user) return json({ error: "not found" }, 404);
      return json({ ...user, org: orgById.get(user.orgId) ?? null });
    },
  },
  fetch: (req, server) => {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    return new Response("not found", { status: 404 });
  },
  websocket: {
    message: (ws, message) => {
      if (typeof message !== "string") return;
      try {
        const frame = JSON.parse(message) as { key?: string; data?: unknown[]; subscribe?: boolean };
        const data = Array.isArray(frame.data) ? frame.data : [];
        if (frame.key === "benchFanout" && frame.subscribe === true) {
          const roomId = makeRoomId(frame.key, data);
          joinRoom(ws, roomId);
          sendJson(ws, { type: "sub", roomId, subscribe: true });
          return;
        }
        if (frame.key === "benchFanout" && frame.subscribe === false) {
          leaveAllRooms(ws);
          sendJson(ws, { type: "sub", roomId: makeRoomId(frame.key, data), subscribe: false });
          return;
        }
        if (frame.key === "benchPublish") {
          const [roomId, seq, sentAt] = data;
          publishRoom(makeRoomId("benchFanout", [roomId]), { seq, sentAt });
          sendJson(ws, { type: "msg", key: frame.key, data: true });
          return;
        }
        sendJson(ws, { error: `WebSocket route "${frame.key ?? ""}" is not registered`, statusCode: 500 });
      } catch (error) {
        sendJson(ws, { error: error instanceof Error ? error.message : String(error), statusCode: 500 });
      }
    },
    close: (ws) => {
      leaveAllRooms(ws);
    },
  },
});

console.info(`[raw-bun] listening on :${port} (${users.length} users)`);

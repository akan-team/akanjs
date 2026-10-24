import { Database, type SQLQueryBindings, type Statement } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import path from "node:path";
import { dayjs, Float, ID, Int, type PromiseOrObject } from "akanjs/base";
import { type ConstantModel, ConstantRegistry, via } from "akanjs/constant";
import {
  by,
  createDocumentQueryHelper,
  type DatabaseCls,
  type DatabaseModel,
  DatabaseRegistry,
  DocumentSchema,
  documentUpdateHelper,
  from,
  into,
} from "akanjs/document";
import { buildEndpoint } from "../../signal/endpointInfo";
import { SignalContext } from "../../signal/signalContext";
import { adapt } from "../adapt";
import {
  type AkanSqlClient,
  type AkanSqlStatement,
  type DocumentDatabaseOwner,
  PostgresDialect,
  SqlDocumentStore,
  SqliteDialect,
} from "./database.adaptor";
import { decodeSolidValue, encodeSolidValue, getSolidConfig, toEpochMs } from "./solidSqlite";
import { resolveDefaultSqliteFile } from "./sqlitePath";

const { set, inc, push, pull, addToSet, unset, mul, min, max } = documentUpdateHelper;
const q = createDocumentQueryHelper();

const InsightTestStatus = ["active", "failed", "deploying"] as const;
class InsightTestInput extends via((f) => ({
  title: f(String),
  score: f(Int, { default: 0 }),
  status: f(String, { default: "active" }),
  tags: f([String], { default: [] }),
})) {}
class InsightTestObject extends via(InsightTestInput, (f) => ({})) {}
class InsightTestLight extends via(InsightTestObject, ["title"] as const, () => ({})) {}
class InsightTestFull extends via(InsightTestObject, InsightTestLight, () => ({})) {}
class InsightTestInsight extends via(InsightTestFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
  activeCount: f(Int, { default: 0, accumulate: { status: "active" } }),
  runningCount: f(Int, { default: 0, accumulate: { status: { oneOf: ["active", "deploying"] } } }),
  taggedCount: f(Int, { default: 0, accumulate: { tags: { oneOf: ["featured", "urgent"] } } }),
})) {}
const insightTestConstant = ConstantRegistry.buildModel(
  "sqliteInsightTest",
  InsightTestInput,
  InsightTestObject,
  InsightTestFull,
  InsightTestLight,
  InsightTestInsight,
  { InsightTestInput, InsightTestObject, InsightTestFull, InsightTestLight, InsightTestInsight, InsightTestStatus },
);
class InsightTestFilter extends from(InsightTestFull, () => ({ query: {}, sort: {} })) {}
class InsightTestDoc extends by(InsightTestFull) {}
class InsightTestModel extends into(InsightTestDoc, InsightTestFilter, insightTestConstant, () => ({})) {}
const insightTestDatabase = DatabaseRegistry.buildModel(
  "sqliteInsightTest",
  InsightTestInput as unknown as DatabaseCls<InstanceType<typeof InsightTestInput>>,
  InsightTestDoc,
  InsightTestModel,
  InsightTestObject,
  InsightTestInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  InsightTestFilter,
);

class TicketHistory extends via((f) => ({
  action: f(String),
  content: f([String], { default: [] }),
  count: f(Int, { default: 0 }),
  flag: f(Boolean, { default: false }),
})) {}
class TicketTestInput extends via((f) => ({
  title: f(String),
  status: f(String, { default: "active" }),
  archived: f(Boolean, { default: false }),
  issuedAt: f(Date).optional(),
  transactionAt: f(Date, { default: dayjs(0) }),
  histories: f([TicketHistory]),
})) {}
class TicketTestObject extends via(TicketTestInput, (f) => ({
  hiddenNote: f.hidden(String),
  secretToken: f.secret(String),
})) {}
class TicketTestLight extends via(TicketTestObject, ["title"] as const, () => ({})) {}
class TicketTestFull extends via(TicketTestObject, TicketTestLight, () => ({})) {}
class TicketTestInsight extends via(TicketTestFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
})) {}
const ticketTestConstant = ConstantRegistry.buildModel(
  "sqliteTicketTest",
  TicketTestInput,
  TicketTestObject,
  TicketTestFull,
  TicketTestLight,
  TicketTestInsight,
  { TicketTestInput, TicketTestObject, TicketTestFull, TicketTestLight, TicketTestInsight, TicketHistory },
);
class TicketTestFilter extends from(TicketTestFull, () => ({ query: {}, sort: {} })) {}
class TicketTestDoc extends by(TicketTestFull) {}
class TicketTestModel extends into(TicketTestDoc, TicketTestFilter, ticketTestConstant, () => ({})) {}
const ticketTestDatabase = DatabaseRegistry.buildModel(
  "sqliteTicketTest",
  TicketTestInput as unknown as DatabaseCls<InstanceType<typeof TicketTestInput>>,
  TicketTestDoc,
  TicketTestModel,
  TicketTestObject,
  TicketTestInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  TicketTestFilter,
);

class ScalarDefaultCoordinate extends via((f) => ({
  type: f(String, { default: "Point" }),
  coordinates: f([Float], { default: [0, 0] }),
  altitude: f(Float, { default: 0 }),
})) {}
class ScalarDefaultPlace extends via((f) => ({
  label: f(String, { default: "unnamed" }),
  coordinate: f(ScalarDefaultCoordinate),
})) {}
class ScalarDefaultInput extends via((f) => ({
  title: f(String),
  location: f(ScalarDefaultCoordinate),
  place: f(ScalarDefaultPlace),
  tags: f([String]),
  spot: f(ScalarDefaultCoordinate).optional(),
  owner: f(TicketTestLight).optional(),
})) {}
class ScalarDefaultObject extends via(ScalarDefaultInput, () => ({})) {}
class ScalarDefaultLight extends via(ScalarDefaultObject, ["title"] as const, () => ({})) {}
class ScalarDefaultFull extends via(ScalarDefaultObject, ScalarDefaultLight, () => ({})) {}
class ScalarDefaultInsight extends via(ScalarDefaultFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
})) {}
const scalarDefaultConstant = ConstantRegistry.buildModel(
  "sqliteScalarDefaultTest",
  ScalarDefaultInput,
  ScalarDefaultObject,
  ScalarDefaultFull,
  ScalarDefaultLight,
  ScalarDefaultInsight,
  { ScalarDefaultInput, ScalarDefaultObject, ScalarDefaultFull, ScalarDefaultLight, ScalarDefaultInsight },
);
class ScalarDefaultFilter extends from(ScalarDefaultFull, () => ({ query: {}, sort: {} })) {}
class ScalarDefaultDoc extends by(ScalarDefaultFull) {}
class ScalarDefaultModel extends into(ScalarDefaultDoc, ScalarDefaultFilter, scalarDefaultConstant, () => ({})) {}
const scalarDefaultDatabase = DatabaseRegistry.buildModel(
  "sqliteScalarDefaultTest",
  ScalarDefaultInput as unknown as DatabaseCls<InstanceType<typeof ScalarDefaultInput>>,
  ScalarDefaultDoc,
  ScalarDefaultModel,
  ScalarDefaultObject,
  ScalarDefaultInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  ScalarDefaultFilter,
);

class RelationRequiredInput extends via((f) => ({
  title: f(String, { default: "relation" }),
  owner: f(TicketTestLight),
})) {}
class RelationRequiredObject extends via(RelationRequiredInput, () => ({})) {}
class RelationRequiredLight extends via(RelationRequiredObject, ["title"] as const, () => ({})) {}
class RelationRequiredFull extends via(RelationRequiredObject, RelationRequiredLight, () => ({})) {}
class RelationRequiredInsight extends via(RelationRequiredFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
})) {}
const relationRequiredConstant = ConstantRegistry.buildModel(
  "sqliteRelationRequiredTest",
  RelationRequiredInput,
  RelationRequiredObject,
  RelationRequiredFull,
  RelationRequiredLight,
  RelationRequiredInsight,
  {
    RelationRequiredInput,
    RelationRequiredObject,
    RelationRequiredFull,
    RelationRequiredLight,
    RelationRequiredInsight,
  },
);
class RelationRequiredFilter extends from(RelationRequiredFull, () => ({ query: {}, sort: {} })) {}
class RelationRequiredDoc extends by(RelationRequiredFull) {}
class RelationRequiredModel extends into(
  RelationRequiredDoc,
  RelationRequiredFilter,
  relationRequiredConstant,
  () => ({}),
) {}
const relationRequiredDatabase = DatabaseRegistry.buildModel(
  "sqliteRelationRequiredTest",
  RelationRequiredInput as unknown as DatabaseCls<InstanceType<typeof RelationRequiredInput>>,
  RelationRequiredDoc,
  RelationRequiredModel,
  RelationRequiredObject,
  RelationRequiredInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  RelationRequiredFilter,
);

class ImmutableTestInput extends via((f) => ({
  title: f(String),
  ownerId: f(ID, { immutable: true }),
  origin: f(String, { default: "seed", immutable: true }),
})) {}
class ImmutableTestObject extends via(ImmutableTestInput, () => ({})) {}
class ImmutableTestLight extends via(ImmutableTestObject, ["title"] as const, () => ({})) {}
class ImmutableTestFull extends via(ImmutableTestObject, ImmutableTestLight, () => ({})) {}
class ImmutableTestInsight extends via(ImmutableTestFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
})) {}
const immutableTestConstant = ConstantRegistry.buildModel(
  "sqliteImmutableTest",
  ImmutableTestInput,
  ImmutableTestObject,
  ImmutableTestFull,
  ImmutableTestLight,
  ImmutableTestInsight,
  { ImmutableTestInput, ImmutableTestObject, ImmutableTestFull, ImmutableTestLight, ImmutableTestInsight },
);
class ImmutableTestFilter extends from(ImmutableTestFull, () => ({ query: {}, sort: {} })) {}
class ImmutableTestDoc extends by(ImmutableTestFull) {}
class ImmutableTestModel extends into(ImmutableTestDoc, ImmutableTestFilter, immutableTestConstant, () => ({})) {}
const immutableTestDatabase = DatabaseRegistry.buildModel(
  "sqliteImmutableTest",
  ImmutableTestInput as unknown as DatabaseCls<InstanceType<typeof ImmutableTestInput>>,
  ImmutableTestDoc,
  ImmutableTestModel,
  ImmutableTestObject,
  ImmutableTestInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  ImmutableTestFilter,
);

class TestSqliteStatement implements AkanSqlStatement {
  constructor(private readonly statement: Statement) {}

  async run(...params: unknown[]) {
    return this.statement.run(...(params as SQLQueryBindings[]));
  }

  async get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null> {
    return (this.statement.get(...(params as SQLQueryBindings[])) as Row | null) ?? null;
  }

  async all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]> {
    return this.statement.all(...(params as SQLQueryBindings[])) as Row[];
  }
}

class TestSqliteClient implements AkanSqlClient {
  constructor(readonly db: Database) {}

  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    const values = Array.isArray(params) ? params : Object.values(params);
    return this.db.query(sql).run(...(values as SQLQueryBindings[]));
  }

  prepare(sql: string): AkanSqlStatement {
    return new TestSqliteStatement(this.db.query(sql));
  }

  async close() {
    this.db.close();
  }
}

class TestDatabaseOwner implements DocumentDatabaseOwner {
  private readonly meta = new Map<string, string>();
  readonly afterCommitCallbacks: (() => unknown)[] = [];

  constructor(private readonly client: AkanSqlClient) {}

  getConnection() {
    return this.client;
  }

  getSearchIndex() {
    return null;
  }

  getMeta(key: string) {
    return this.meta.get(key);
  }

  async setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }

  listMeta(prefix: string) {
    return [...this.meta].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value }));
  }

  async deleteMeta(key: string) {
    this.meta.delete(key);
  }

  async afterCommit(fn: () => PromiseOrObject<void>) {
    this.afterCommitCallbacks.push(fn);
    await fn();
  }
}

const withStore = async (
  constant: ConstantModel,
  database: DatabaseModel,
  run: (fixture: { client: TestSqliteClient; store: SqlDocumentStore }) => Promise<void>,
  schema = new DocumentSchema(),
) => {
  const client = new TestSqliteClient(new Database(":memory:", { strict: true, create: true }));
  const store = new SqlDocumentStore(new TestDatabaseOwner(client), constant, database, schema);
  try {
    await client.execute(
      `CREATE TABLE IF NOT EXISTS "_akan_meta" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL, "updatedAt" INTEGER NOT NULL)`,
    );
    await store.ensure();
    await run({ client, store });
  } finally {
    await client.close();
  }
};

describe("solid sqlite utilities", () => {
  test("encodes and decodes solid values", () => {
    const buffer = Buffer.from("hello");

    expect(encodeSolidValue("value")).toEqual({ type: "string", value: "value" });
    expect(encodeSolidValue(12)).toEqual({ type: "number", value: "12" });
    expect(encodeSolidValue(buffer)).toEqual({ type: "buffer", value: buffer });

    expect(decodeSolidValue<string>("string", "value")).toBe("value");
    expect(decodeSolidValue<number>("number", "12")).toBe(12);
    expect(decodeSolidValue<Buffer>("buffer", buffer)).toEqual(buffer);
    expect(decodeSolidValue<Buffer>("buffer", "hello")).toEqual(buffer);
    expect(decodeSolidValue<string>("string", null)).toBeUndefined();
  });

  test("round-trips structured (object/array) solid values as json", () => {
    // bun:sqlite cannot bind objects or arrays, so refresh sessions round-trip as JSON.
    const session = { id: "s1", subject: "admin", expiresAt: "2026-01-01T00:00:00.000Z", userAgent: undefined };
    const encodedObj = encodeSolidValue(session);
    expect(encodedObj.type).toBe("json");
    expect(typeof encodedObj.value).toBe("string");
    expect(decodeSolidValue<Omit<typeof session, "userAgent">>("json", encodedObj.value)).toEqual({
      id: "s1",
      subject: "admin",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });

    const hashes = ["a", "b", "c"];
    const encodedArr = encodeSolidValue(hashes);
    expect(encodedArr.type).toBe("json");
    expect(decodeSolidValue<string[]>("json", encodedArr.value)).toEqual(hashes);

    // Top-level undefined is coerced to JSON null rather than producing an invalid binding.
    expect(encodeSolidValue(undefined)).toEqual({ type: "json", value: "null" });
  });

  test("converts optional expiration values to epoch ms", () => {
    const date = dayjs("2026-01-01T00:00:00.000Z");

    expect(toEpochMs()).toBeNull();
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs(1234)).toBe(1234);
    expect(toEpochMs(date)).toBe(date.valueOf());
  });

  test("resolves default sqlite paths and solid config", () => {
    const previousSqliteDir = process.env.AKAN_SQLITE_DIR;
    const previousSolidDbPath = process.env.AKAN_SOLID_DB_PATH;
    const previousOperationMode = process.env.AKAN_PUBLIC_OPERATION_MODE;
    try {
      process.env.AKAN_SQLITE_DIR = "/tmp/akan-sqlite";
      expect(
        resolveDefaultSqliteFile({
          appName: "demo",
          fileName: "demo.db",
          isProduction: false,
          workspaceRoot: "/workspace",
        }),
      ).toBe(path.join("/tmp/akan-sqlite", "demo.db"));

      delete process.env.AKAN_SQLITE_DIR;
      expect(
        resolveDefaultSqliteFile({
          appName: "demo",
          fileName: "demo.db",
          isProduction: false,
          workspaceRoot: "/workspace",
        }),
      ).toBe(path.join("/workspace", "local", "apps", "demo", "demo.db"));

      expect(
        resolveDefaultSqliteFile({
          appName: "demo",
          fileName: "demo.db",
          isProduction: true,
          operationMode: "local",
          workspaceRoot: "/workspace",
        }),
      ).toBe(path.join("/workspace", "local", "apps", "demo", "demo.db"));

      process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
      expect(
        resolveDefaultSqliteFile({
          appName: "demo",
          fileName: "demo.db",
          isProduction: true,
          workspaceRoot: "/workspace",
        }),
      ).toBe(path.join("/workspace", "local", "apps", "demo", "demo.db"));

      expect(
        resolveDefaultSqliteFile({
          appName: "demo",
          fileName: "demo.db",
          isProduction: true,
          operationMode: "cloud",
          workspaceRoot: "/workspace",
        }),
      ).toBe(path.join(process.cwd(), "sqlite", "demo.db"));

      process.env.AKAN_SOLID_DB_PATH = "/tmp/solid.db";
      expect(
        getSolidConfig({
          solid: { queueLeaseMs: 7, journalMode: "MEMORY" },
        }).filePath,
      ).toBe("/tmp/solid.db");
      expect(
        getSolidConfig({
          solid: { queueLeaseMs: 7, journalMode: "MEMORY" },
        }),
      ).toMatchObject({
        journalMode: "MEMORY",
        queueLeaseMs: 7,
        busyTimeoutMs: 5000,
        synchronous: "NORMAL",
      });
    } finally {
      if (previousSqliteDir === undefined) delete process.env.AKAN_SQLITE_DIR;
      else process.env.AKAN_SQLITE_DIR = previousSqliteDir;
      if (previousSolidDbPath === undefined) delete process.env.AKAN_SOLID_DB_PATH;
      else process.env.AKAN_SOLID_DB_PATH = previousSolidDbPath;
      if (previousOperationMode === undefined) delete process.env.AKAN_PUBLIC_OPERATION_MODE;
      else process.env.AKAN_PUBLIC_OPERATION_MODE = previousOperationMode;
    }
  });

  test("hydrates new documents with schema defaults before save", async () => {
    await withStore(insightTestConstant, insightTestDatabase, async ({ store }) => {
      const doc = store.hydrate({ title: "Draft" });

      expect(doc.score).toBe(0);
      expect(doc.status).toBe("active");
      expect(doc.tags).toEqual([]);
      await expect(doc.save()).resolves.toMatchObject({
        title: "Draft",
        score: 0,
        status: "active",
        tags: [],
      });
    });
  });

  test("fills nested constant defaults inside arrays on save", async () => {
    await withStore(ticketTestConstant, ticketTestDatabase, async ({ store }) => {
      const created = await store.create({ title: "Ticket", histories: [{ action: "open" }] });
      expect(created.histories[0]).toMatchObject({ action: "open", content: [], count: 0, flag: false });

      created.histories.push({ action: "close" });
      const saved = await created.save();
      expect(saved.histories[1]).toMatchObject({ action: "close", content: [], count: 0, flag: false });

      const fetched = await store.pickById(created.id);
      expect(fetched.histories[0]).toMatchObject({ action: "open", content: [], count: 0, flag: false });
      expect(fetched.histories[1]).toMatchObject({ action: "close", content: [], count: 0, flag: false });
      expect(fetched.histories[0].content).not.toBe(fetched.histories[1].content);
      expect(saved.histories[0].content).not.toBe(saved.histories[1].content);
    });
  });

  test("constructs an omitted required nested scalar from its own field defaults", async () => {
    await withStore(scalarDefaultConstant, scalarDefaultDatabase, async ({ store }) => {
      const created = await store.create({ title: "Edge" });
      expect(created.location).toEqual({ type: "Point", coordinates: [0, 0], altitude: 0 });
      expect(created.place).toEqual({
        label: "unnamed",
        coordinate: { type: "Point", coordinates: [0, 0], altitude: 0 },
      });
      expect(created.tags).toEqual([]);
      expect(created.owner).toBeUndefined();
      expect(created.spot).toBeUndefined();

      const fetched = await store.pickById(created.id);
      expect(fetched.location).toEqual({ type: "Point", coordinates: [0, 0], altitude: 0 });
      expect(fetched.place.coordinate).toEqual({ type: "Point", coordinates: [0, 0], altitude: 0 });
      // An optional nested scalar is absent, not defaulted — `getDefault` reads `nullable` before `isScalar`.
      expect(fetched.spot).toBeNull();
    });
  });

  test("merges scalar defaults into a partially supplied nested scalar", async () => {
    await withStore(scalarDefaultConstant, scalarDefaultDatabase, async ({ store }) => {
      const empty = await store.create({ title: "Empty", location: {} });
      expect(empty.location).toEqual({ type: "Point", coordinates: [0, 0], altitude: 0 });

      const partial = await store.create({ title: "Partial", location: { coordinates: [127, 37] } });
      expect(partial.location).toEqual({ type: "Point", coordinates: [127, 37], altitude: 0 });
    });
  });

  test("gives each document its own copy of an array default", async () => {
    await withStore(scalarDefaultConstant, scalarDefaultDatabase, async ({ store }) => {
      const first = await store.create({ title: "First" });
      first.tags.push("mutated");
      await first.save();

      const second = await store.create({ title: "Second" });
      expect(second.tags).toEqual([]);
      expect(second.place).not.toBe(first.place);
      expect(second.location.coordinates).not.toBe(first.location.coordinates);
    });
  });

  test("fills a nested scalar missing from a stored row instead of failing the update", async () => {
    await withStore(scalarDefaultConstant, scalarDefaultDatabase, async ({ client, store }) => {
      const created = await store.create({ title: "Legacy" });
      await client.execute(`UPDATE "sqliteScalarDefaultTest" SET "_doc" = ? WHERE "id" = ?`, [
        JSON.stringify({ title: "Legacy", tags: [] }),
        created.id,
      ]);

      const updated = await store.update(created.id, { title: "Migrated" });
      expect(updated.title).toBe("Migrated");
      expect(updated.location).toEqual({ type: "Point", coordinates: [0, 0], altitude: 0 });
    });
  });

  test("gives a projected read of a stored row missing an array its own copy of the default", async () => {
    await withStore(scalarDefaultConstant, scalarDefaultDatabase, async ({ client, store }) => {
      const created = await store.create({ title: "Legacy" });
      await client.execute(`UPDATE "sqliteScalarDefaultTest" SET "_doc" = ? WHERE "id" = ?`, [
        JSON.stringify({ title: "Legacy" }),
        created.id,
      ]);

      const [projected] = await store.find({}, { select: { tags: true } });
      expect(projected.tags).toEqual([]);
      projected.tags.push("mutated");

      const [again] = await store.find({}, { select: { tags: true } });
      expect(again.tags).toEqual([]);
      expect((await store.create({ title: "Next" })).tags).toEqual([]);
    });
  });

  test("fills a nested scalar missing from a stored row on a projected read, as a full read does", async () => {
    await withStore(scalarDefaultConstant, scalarDefaultDatabase, async ({ client, store }) => {
      const created = await store.create({ title: "Legacy" });
      await client.execute(`UPDATE "sqliteScalarDefaultTest" SET "_doc" = ? WHERE "id" = ?`, [
        JSON.stringify({ title: "Legacy", tags: [] }),
        created.id,
      ]);

      const [projected] = await store.find({}, { select: { location: true, spot: true } });
      const full = await store.pickById(created.id);
      expect(projected.location).toEqual({ type: "Point", coordinates: [0, 0], altitude: 0 });
      expect(projected.location).toEqual(full.location);
      expect(projected.spot).toBeNull();
    });
  });

  test("still refuses a missing required relation", async () => {
    await withStore(relationRequiredConstant, relationRequiredDatabase, async ({ store }) => {
      await expect(store.create({})).rejects.toThrow("Missing required field: owner");
    });
  });

  test("keeps a valid caller-supplied id and rejects anything else", async () => {
    await withStore(ticketTestConstant, ticketTestDatabase, async ({ store }) => {
      await expect(store.create({ id: "not-an-id", title: "Ticket", histories: [] })).rejects.toThrow(
        "Invalid ID value: not-an-id",
      );
      await expect(store.create({ id: "", title: "Ticket", histories: [] })).rejects.toThrow("Invalid ID value: ");

      const pinned = "aaaaaaaaaaaaaaaaaaaaaaaa";
      const created = await store.create({ id: pinned, title: "Ticket", histories: [] });
      expect(created.id).toBe(pinned);
      expect((await store.pickById(pinned)).id).toBe(pinned);
    });
  });

  test("runs save hooks on document persistence but bypasses them on query-based writes", async () => {
    const schema = new DocumentSchema();
    const calls: string[] = [];
    schema.pre("save", () => {
      calls.push("pre:save");
    });
    schema.post("save", () => {
      calls.push("post:save");
    });
    schema.pre("create", () => {
      calls.push("pre:create");
    });
    schema.post("create", () => {
      calls.push("post:create");
    });
    schema.pre("update", () => {
      calls.push("pre:update");
    });
    schema.post("update", () => {
      calls.push("post:update");
    });
    schema.pre("remove", () => {
      calls.push("pre:remove");
    });
    schema.post("remove", () => {
      calls.push("post:remove");
    });
    await withStore(
      ticketTestConstant,
      ticketTestDatabase,
      async ({ store }) => {
        const created = await store.create({ title: "Ticket", histories: [] });
        expect(calls).toEqual(["pre:save", "pre:create", "post:create", "post:save"]);

        calls.length = 0;
        created.title = "Renamed";
        await created.save();
        expect(calls).toEqual(["pre:save", "pre:update", "post:update", "post:save"]);

        calls.length = 0;
        await store.updateOneByQuery({ id: created.id }, { status: set("closed") });
        expect(calls).toEqual([]);

        calls.length = 0;
        await store.updateManyByQuery({ id: created.id }, { status: set("archived") });
        expect(calls).toEqual([]);

        calls.length = 0;
        await store.updateOneByQuery(
          { id: "111111111111111111111111", title: "Upserted" },
          { histories: set([]) },
          { upsert: true },
        );
        expect(calls).toEqual(["pre:create", "post:create"]);

        calls.length = 0;
        await store.remove(created.id);
        expect(calls).toEqual(["pre:remove", "post:remove"]);

        calls.length = 0;
        await store.removeManyByQuery({ id: "111111111111111111111111" });
        expect(calls).toEqual([]);
      },
      schema,
    );
  });

  test("applies query updates atomically via json operators", async () => {
    await withStore(insightTestConstant, insightTestDatabase, async ({ store }) => {
      const a = await store.create({ title: "A", score: 10, status: "active", tags: ["x"] });
      const b = await store.create({ title: "B", score: 5, status: "failed", tags: [] });

      const r1 = await store.updateOneByQuery({ id: a.id }, { status: set("done"), score: inc(5), tags: push("y") });
      expect(r1).toEqual({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedId: null });
      const a1 = await store.pickById(a.id);
      expect(a1.status).toBe("done");
      expect(a1.score).toBe(15);
      expect(a1.tags).toEqual(["x", "y"]);

      await store.updateOneByQuery({ id: a.id }, { score: mul(2) });
      expect((await store.pickById(a.id)).score).toBe(30);
      await store.updateOneByQuery({ id: a.id }, { score: min(20) });
      expect((await store.pickById(a.id)).score).toBe(20);
      await store.updateOneByQuery({ id: a.id }, { score: max(25) });
      expect((await store.pickById(a.id)).score).toBe(25);

      await store.updateOneByQuery({ id: a.id }, { tags: addToSet("y") });
      expect((await store.pickById(a.id)).tags).toEqual(["x", "y"]);
      await store.updateOneByQuery({ id: a.id }, { tags: addToSet("z") });
      expect((await store.pickById(a.id)).tags).toEqual(["x", "y", "z"]);
      await store.updateOneByQuery({ id: a.id }, { tags: pull("y") });
      expect((await store.pickById(a.id)).tags).toEqual(["x", "z"]);

      // unset removes the stored key; the read path refills the schema default
      await store.updateOneByQuery({ id: a.id }, { status: unset() });
      expect((await store.pickById(a.id)).status).toBe("active");

      const rMany = await store.updateManyByQuery({}, ({ inc }) => ({ score: inc(1) }));
      expect(rMany).toEqual({ acknowledged: true, matchedCount: 2, modifiedCount: 2 });
      expect((await store.pickById(a.id)).score).toBe(26);
      expect((await store.pickById(b.id)).score).toBe(6);

      const rNone = await store.updateOneByQuery({ id: "missing" }, { score: set(1) });
      expect(rNone).toEqual({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: null });
      expect(await store.count()).toBe(2);

      // upsert insert applies inc from 0 and setOnInsert (functional builder form)
      const rUp = await store.updateOneByQuery(
        { id: "222222222222222222222222", title: "New" },
        ({ inc, setOnInsert }) => ({ score: inc(3), status: setOnInsert("fresh") }),
        { upsert: true },
      );
      expect(rUp).toEqual({
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 1,
        upsertedId: "222222222222222222222222",
      });
      const up = await store.pickById("222222222222222222222222");
      expect(up.score).toBe(3);
      expect(up.status).toBe("fresh");

      const rDel = await store.removeManyByQuery({ status: "failed" });
      expect(rDel).toEqual({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
      expect(await store.findId({ id: b.id })).toBeNull();
      expect(await store.count()).toBe(2);
    });
  });

  test("excludes secret fields from default reads while preserving them on update", async () => {
    await withStore(ticketTestConstant, ticketTestDatabase, async ({ client, store }) => {
      const created = await store.create({
        title: "Secret",
        histories: [],
        hiddenNote: "server-visible",
        secretToken: "token-1",
      });
      const fetched = await store.pickById(created.id);
      const selected = await store.pickOne({ id: created.id }, { select: { secretToken: true } });

      expect(fetched.hiddenNote).toBe("server-visible");
      expect(fetched).not.toHaveProperty("secretToken");
      expect(selected.secretToken).toBe("token-1");

      await store.update(created.id, { title: "Updated" });
      const row = await client
        .prepare(`SELECT "_doc" FROM "sqliteTicketTest" WHERE "id" = ?`)
        .get<{ _doc: string }>(created.id);
      const stored = JSON.parse(row?._doc ?? "{}");
      const updated = await store.pickOne({ id: created.id }, { select: { title: true, secretToken: true } });

      expect(stored.secretToken).toBe("token-1");
      expect(updated).toMatchObject({ title: "Updated", secretToken: "token-1" });
    });
  });

  test("keeps every projected field at its declared type", async () => {
    await withStore(ticketTestConstant, ticketTestDatabase, async ({ store }) => {
      const objectish = await store.create({
        title: "Ticket",
        archived: true,
        issuedAt: dayjs(1700000000000),
        histories: [{ action: "open", flag: true }],
        hiddenNote: "note",
        secretToken: '{"a":1}',
      });
      const selected = await store.pickOne(
        { id: objectish.id },
        { select: { title: true, archived: true, issuedAt: true, histories: true, secretToken: true } },
      );

      expect(selected.secretToken).toBe('{"a":1}');
      expect(selected.archived).toBe(true);
      expect(selected.title).toBe("Ticket");
      expect(selected.issuedAt?.valueOf()).toBe(1700000000000);
      expect(selected.histories[0]).toMatchObject({ action: "open", flag: true, content: [], count: 0 });

      const arrayish = await store.create({
        title: "Ticket",
        histories: [],
        hiddenNote: "note",
        secretToken: '["a","b"]',
      });
      const plain = await store.pickOne({ id: arrayish.id }, { select: { archived: true, secretToken: true } });

      expect(plain.secretToken).toBe('["a","b"]');
      expect(plain.archived).toBe(false);
    });
  });

  // A read-back document carries an explicit null the insert never wrote, so `missing` holds only before a save.
  test("separates an absent key from a null value", async () => {
    await withStore(ticketTestConstant, ticketTestDatabase, async ({ store }) => {
      const created = await store.create({ title: "T", histories: [], hiddenNote: "n", secretToken: "s" });
      expect(await store.count(q.missing("issuedAt"))).toBe(1);
      expect(await store.count(q.empty("issuedAt"))).toBe(1);

      await (await store.pickById(created.id)).save();
      expect(await store.count(q.missing("issuedAt"))).toBe(0);
      expect(await store.count(q.empty("issuedAt"))).toBe(1);
    });
  });

  test("rejects immutable field changes on the document path but not on query writes", async () => {
    await withStore(immutableTestConstant, immutableTestDatabase, async ({ store }) => {
      const created = await store.create({ title: "First", ownerId: "user-1" });
      expect(created.ownerId).toBe("user-1");
      expect(created.origin).toBe("seed");

      const doc = await store.pickById(created.id);
      doc.set({ title: "Renamed" });
      await doc.save();
      expect((await store.pickById(created.id)).title).toBe("Renamed");

      await expect(store.update(created.id, { ownerId: "user-2" })).rejects.toMatchObject({
        message: "base.error.immutableField",
        statusCode: 400,
        data: { field: "ownerId" },
        details: { model: "sqliteImmutableTest", id: created.id },
      });
      expect((await store.pickById(created.id)).ownerId).toBe("user-1");

      const stale = await store.pickById(created.id);
      stale.set({ ownerId: "user-2", origin: "moved" });
      await expect(stale.save()).rejects.toMatchObject({
        message: "base.error.immutableField",
        data: { field: "ownerId, origin" },
      });

      await store.updateManyByQuery({ id: created.id }, { ownerId: set("user-3") });
      expect((await store.pickById(created.id)).ownerId).toBe("user-3");
    });
  });

  test("answers an immutable field change as a 400 carrying its dictionary key, not a generalized 500", async () => {
    await withStore(immutableTestConstant, immutableTestDatabase, async ({ store }) => {
      const created = await store.create({ title: "First", ownerId: "user-1" });
      const endpointInfo = buildEndpoint.mutation(String).exec(() => "unreached");
      const adaptor = new (adapt("sqliteImmutableTestEndpoint"))();
      const response = (await SignalContext.try(adaptor, endpointInfo, "updateSqliteImmutableTest", async () => {
        await store.update(created.id, { ownerId: "user-2" });
        return undefined;
      })) as Response;
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "base.error.immutableField",
        statusCode: 400,
        data: { field: "ownerId" },
      });
    });
  });

  test("fills missing nested and top-level defaults when loading legacy rows", async () => {
    await withStore(ticketTestConstant, ticketTestDatabase, async ({ client, store }) => {
      const now = Date.now();
      // Legacy row: nested `content`/`count`/`flag` and top-level `status` were never persisted.
      const legacyDoc = JSON.stringify({ title: "Legacy", histories: [{ action: "open" }] });
      await client.execute(
        `INSERT INTO "sqliteTicketTest" ("id", "createdAt", "updatedAt", "removedAt", "_doc") VALUES (?, ?, ?, ?, ?)`,
        ["legacy-1", now, now, null, legacyDoc],
      );

      const fetched = await store.pickById("legacy-1");
      expect(fetched.status).toBe("active");
      expect(fetched.histories[0]).toMatchObject({ action: "open", content: [], count: 0, flag: false });
    });
  });

  test("normalizes date fields to epoch storage regardless of input shape", async () => {
    await withStore(ticketTestConstant, ticketTestDatabase, async ({ client, store }) => {
      const iso = "2026-06-06T13:52:39.747Z";
      // `issuedAt` arrives as an ISO string while `transactionAt` falls back to its dayjs(0) default.
      const created = await store.create({ title: "Dated", issuedAt: iso, histories: [] });
      expect(dayjs.isDayjs(created.issuedAt)).toBe(true);
      expect(created.issuedAt.valueOf()).toBe(dayjs(iso).valueOf());
      expect(created.transactionAt.valueOf()).toBe(0);

      const row = await client
        .prepare(`SELECT "_doc" FROM "sqliteTicketTest" WHERE "id" = ?`)
        .get<{ _doc: string }>(created.id);
      const stored = JSON.parse(row?._doc ?? "{}");
      expect(typeof stored.issuedAt).toBe("number");
      expect(stored.issuedAt).toBe(dayjs(iso).valueOf());
      expect(typeof stored.transactionAt).toBe("number");
      expect(stored.transactionAt).toBe(0);

      const fetched = await store.pickById(created.id);
      expect(fetched.issuedAt.valueOf()).toBe(dayjs(iso).valueOf());
      expect(fetched.transactionAt.valueOf()).toBe(0);
    });
  });

  test("reads legacy ISO-string dates as valid dayjs", async () => {
    await withStore(ticketTestConstant, ticketTestDatabase, async ({ client, store }) => {
      const iso = "2026-06-06T13:52:39.747Z";
      const now = Date.now();
      // Legacy row persisted `issuedAt` as an ISO string instead of epoch ms.
      const legacyDoc = JSON.stringify({ title: "Legacy", issuedAt: iso, histories: [] });
      await client.execute(
        `INSERT INTO "sqliteTicketTest" ("id", "createdAt", "updatedAt", "removedAt", "_doc") VALUES (?, ?, ?, ?, ?)`,
        ["legacy-date-1", now, now, null, legacyDoc],
      );

      const fetched = await store.pickById("legacy-date-1");
      expect(fetched.issuedAt.isValid()).toBe(true);
      expect(fetched.issuedAt.valueOf()).toBe(dayjs(iso).valueOf());
    });
  });

  test("counts insight fields with document query accumulates", async () => {
    await withStore(insightTestConstant, insightTestDatabase, async ({ store }) => {
      await store.create({ title: "Alpha", score: 12, status: "active", tags: ["featured"] });
      await store.create({ title: "Beta", score: 4, status: "failed", tags: ["cold"] });
      await store.create({ title: "Gamma", score: 20, status: "deploying", tags: ["urgent"] });

      await expect(store.insight()).resolves.toEqual({
        count: 3,
        activeCount: 1,
        runningCount: 2,
        taggedCount: 2,
      });
      await expect(store.insight({ score: { gte: 10 } })).resolves.toEqual({
        count: 2,
        activeCount: 1,
        runningCount: 2,
        taggedCount: 2,
      });
    });
  });
});

describe("sql dialects", () => {
  test("hands a save hook the document as it was before the write", async () => {
    const schema = new DocumentSchema();
    const seen: { type: string; title: string; previous: string | null; removed: boolean }[] = [];
    schema.post<Record<string, unknown>>("save", function (_next, type, previous) {
      seen.push({
        type: type ?? "update",
        title: this.title as string,
        previous: (previous?.title as string) ?? null,
        removed: !!this.removedAt,
      });
    });
    schema.post<Record<string, unknown>>("remove", function (_next, type, previous) {
      seen.push({
        type: type ?? "update",
        title: this.title as string,
        previous: (previous?.title as string) ?? null,
        removed: !!this.removedAt,
      });
    });
    await withStore(
      ticketTestConstant,
      ticketTestDatabase,
      async ({ store }) => {
        const created = await store.create({ title: "before", histories: [] });
        await store.update(created.id, { title: "after" });
        await store.remove(created.id);

        expect(seen).toEqual([
          { type: "create", title: "before", previous: null, removed: false },
          { type: "update", title: "after", previous: "before", removed: false },
          // A soft delete reaches `remove`, and only the pre-state says the row was still visible a moment ago.
          { type: "remove", title: "after", previous: "after", removed: true },
        ]);
      },
      schema,
    );
  });

  test("sqlite folds update operators into one param-safe json expression", () => {
    const d = new SqliteDialect();
    // Folding must not duplicate the accumulator's placeholders: set + inc => exactly 2 params.
    let acc = d.docColumn();
    const setFrag = d.applyUpdate(acc, "set", "status", "done");
    acc = setFrag.sql;
    const incFrag = d.applyUpdate(acc, "inc", "score", 5);
    acc = incFrag.sql;
    const params = [...setFrag.params, ...incFrag.params];
    expect((acc.match(/\?/g) ?? []).length).toBe(params.length);
    expect(params).toEqual(['"done"', 5]);
    expect(acc).toContain("json_set");
    expect(acc).toContain("json_extract(\"_doc\", '$.score')");
  });

  test("postgres dialect emits jsonb operators and casts", () => {
    const d = new PostgresDialect();
    expect(d.docColumnType()).toBe("jsonb");
    expect(d.timestampType()).toBe("BIGINT");
    expect(d.docValuePlaceholder()).toBe("?::text::jsonb");

    expect(d.eq("score", 5)).toEqual({
      sql: `NULLIF(("_doc" #> '{score}'), 'null'::jsonb) = ?::text::jsonb`,
      params: ["5"],
    });
    expect(d.eq("status", "active", "text")).toEqual({
      sql: `(("_doc" #>> '{status}') COLLATE "C") = ?`,
      params: ["active"],
    });
    expect(d.arrayHas("tags", "x")).toEqual({
      sql: `(("_doc" #> '{tags}') @> ?::text::jsonb AND ("_doc" #> '{tags}') IS NOT NULL)`,
      params: ['"x"'],
    });

    const col = d.docColumn();
    expect(d.applyUpdate(col, "set", "status", "done").sql).toBe(`akan_jsonb_set("_doc", '{status}', ?::text::jsonb)`);
    const incSql = d.applyUpdate(col, "inc", "score", 5).sql;
    expect(incSql).toContain(`#>> '{score}')::numeric, 0) + ?`);
    expect(incSql).toContain("to_jsonb(");
    expect(d.applyUpdate(col, "push", "tags", "y").sql).toContain("jsonb_build_array(?::text::jsonb)");
    expect(d.applyUpdate(col, "pull", "tags", "y").sql).toContain("jsonb_array_elements");
    expect(d.applyUpdate(col, "addToSet", "tags", "y").sql).toContain("@> jsonb_build_array(?::text::jsonb)");
    expect(d.applyUpdate(col, "unset", "status", undefined).sql).toBe(`("_doc") #- '{status}'`);
  });

  test("postgres folding keeps params aligned with placeholders", () => {
    const d = new PostgresDialect();
    let acc = d.docColumn();
    const params: unknown[] = [];
    for (const [op, path, value] of [
      ["set", "status", "done"],
      ["inc", "score", 5],
      ["addToSet", "tags", "y"],
    ] as const) {
      const frag = d.applyUpdate(acc, op, path, value);
      acc = frag.sql;
      params.push(...frag.params);
    }
    expect((acc.match(/\?/g) ?? []).length).toBe(params.length);
  });
});

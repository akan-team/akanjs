import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { dayjs, Int, resetEnvCache } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { DraftStore } from "./draftStore";
import { MemoryStorage, setTestEnv } from "./store.fixture";

const DraftTestFileInput = via((f) => ({
  filename: f(String),
  url: f(String),
}));
const DraftTestFileObject = via(DraftTestFileInput, () => ({}));
const DraftTestFileLight = via(DraftTestFileObject, ["filename", "url"] as const, () => ({}));
const DraftTestFileFull = via(DraftTestFileObject, DraftTestFileLight, () => ({}));
const DraftTestFileInsight = via(DraftTestFileFull, () => ({}));
ConstantRegistry.buildModel(
  "draftTestFile",
  DraftTestFileInput,
  DraftTestFileObject,
  DraftTestFileFull,
  DraftTestFileLight,
  DraftTestFileInsight,
  { DraftTestFileInput, DraftTestFileObject, DraftTestFileFull, DraftTestFileLight, DraftTestFileInsight },
);

const DraftTestInput = via((f) => ({
  title: f(String),
  count: f(Int, { default: 0 }),
  body: f.visual(String).optional(),
  password: f.secret(String).optional(),
  origin: f.hidden(String).optional(),
  image: f(DraftTestFileFull).optional(),
  dueAt: f(Date).optional(),
}));
const DraftTestObject = via(DraftTestInput, () => ({}));
const DraftTestLight = via(DraftTestObject, ["title"] as const, () => ({}));
const DraftTestFull = via(DraftTestObject, DraftTestLight, () => ({}));
const DraftTestInsight = via(DraftTestFull, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel(
  "draftTestItem",
  DraftTestInput,
  DraftTestObject,
  DraftTestFull,
  DraftTestLight,
  DraftTestInsight,
  { DraftTestInput, DraftTestObject, DraftTestFull, DraftTestLight, DraftTestInsight },
);

const jwtOf = (payload: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;

let storage: MemoryStorage;

const setCookie = (jwt: string | null) => {
  (globalThis as { document?: { cookie: string } }).document = { cookie: jwt ? `__Host-jwt:drafttest=${jwt}` : "" };
};

beforeEach(() => {
  setTestEnv("drafttest");
  resetEnvCache();
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage, location: { pathname: "/draft-test", protocol: "http:", host: "localhost" } },
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  setCookie(null);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "document");
  resetEnvCache();
});

describe("DraftStore.identity", () => {
  test("is anon with no token", () => {
    expect(DraftStore.identity()).toBe("anon");
  });

  test("survives a token re-issue that only moves iat/exp", () => {
    setCookie(jwtOf({ sub: "u1", role: "admin", iat: 1, exp: 100 }));
    const before = DraftStore.identity();
    setCookie(jwtOf({ sub: "u1", role: "admin", iat: 2000, exp: 3000, jti: "other" }));
    expect(DraftStore.identity()).toBe(before);
    expect(before).not.toBe("anon");
  });

  test("differs once an identifying claim differs, under whatever name the app used", () => {
    setCookie(jwtOf({ userId: "u1" }));
    const first = DraftStore.identity();
    setCookie(jwtOf({ userId: "u2" }));
    expect(DraftStore.identity()).not.toBe(first);
  });

  test("ignores claim order", () => {
    setCookie(jwtOf({ a: 1, b: 2 }));
    const first = DraftStore.identity();
    setCookie(jwtOf({ b: 2, a: 1 }));
    expect(DraftStore.identity()).toBe(first);
  });

  test("is anon for an unparseable token", () => {
    setCookie("not-a-jwt");
    expect(DraftStore.identity()).toBe("anon");
  });
});

describe("DraftStore scopes", () => {
  const base = { seed: { projectId: "p1" }, modal: "edit", sliceName: "draftTestItem", routePath: "/p/p1/item" };

  test("an edit scope is the record id", () => {
    expect(DraftStore.editScope("abc")).toBe("id:abc");
  });

  test("a new scope ignores dates in the seed, so a date default does not rotate the key", () => {
    const withDate = DraftStore.newScope({ ...base, seed: { projectId: "p1", createdAt: dayjs() } });
    expect(withDate).toBe(DraftStore.newScope(base));
  });

  test("a new scope ignores seed key order", () => {
    const swapped = { ...base, seed: { b: "2", projectId: "p1" } };
    const same = { ...base, seed: { projectId: "p1", b: "2" } };
    expect(DraftStore.newScope(swapped)).toBe(DraftStore.newScope(same));
  });

  test("a new scope separates two parents on the same route shape", () => {
    expect(DraftStore.newScope(base)).not.toBe(DraftStore.newScope({ ...base, seed: { projectId: "p2" } }));
  });

  test("a new scope separates two routes carrying the same empty seed", () => {
    const one = { ...base, seed: {} };
    expect(DraftStore.newScope(one)).not.toBe(DraftStore.newScope({ ...one, routePath: "/org/o2/item" }));
  });

  test("a new scope reads a relation in the seed by its id", () => {
    const asObject = { ...base, seed: { project: { id: "p1", name: "Anything" } } };
    const asOther = { ...base, seed: { project: { id: "p1", name: "Different display data" } } };
    expect(DraftStore.newScope(asObject)).toBe(DraftStore.newScope(asOther));
  });

  test("a key carries app, identity, model and scope", () => {
    expect(DraftStore.keyOf("draftTestItem", "id:abc", "ident")).toBe(
      "akan.draft.drafttest.ident.draftTestItem.id:abc",
    );
  });
});

describe("DraftStore form codec", () => {
  const form = {
    id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    title: "Hello",
    count: 3,
    body: "<p>twenty minutes of typing</p>",
    password: "hunter2",
    origin: "data:image/png;base64,ZZZZ",
    image: { id: "bbbbbbbbbbbbbbbbbbbbbbbb", filename: "a.png", url: "https://x/a.png" },
    dueAt: dayjs("2026-01-02T03:04:05.000Z"),
  };

  test("drops secret and hidden, keeps visual and id", () => {
    const encoded = DraftStore.encodeForm("draftTestItem", form);
    expect(encoded.password).toBeUndefined();
    expect(encoded.origin).toBeUndefined();
    expect(encoded.body).toBe("<p>twenty minutes of typing</p>");
    expect(encoded.id).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  test("round-trips a date back to a dayjs and keeps a relation", () => {
    const decoded = DraftStore.decodeForm("draftTestItem", DraftStore.encodeForm("draftTestItem", form)) as {
      title: string;
      dueAt: { toISOString: () => string };
      image: { filename: string };
    };
    expect(decoded.title).toBe("Hello");
    expect(decoded.dueAt.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(decoded.image.filename).toBe("a.png");
  });

  test("a form hash tracks a field change and ignores a secret one", () => {
    const before = DraftStore.formHash("draftTestItem", form);
    expect(DraftStore.formHash("draftTestItem", { ...form, password: "changed" })).toBe(before);
    expect(DraftStore.formHash("draftTestItem", { ...form, title: "Changed" })).not.toBe(before);
  });
});

describe("DraftStore storage", () => {
  const record = (savedAt: string) => ({ v: 1, savedAt, baseUpdatedAt: null, form: { title: "x" } });

  test("round-trips a record", async () => {
    const key = DraftStore.keyOf("draftTestItem", "id:a", "ident");
    await DraftStore.write(key, record(new Date().toISOString()));
    expect((await DraftStore.read(key))?.form).toEqual({ title: "x" });
    await DraftStore.remove(key);
    expect(await DraftStore.read(key)).toBeNull();
  });

  test("drops a record written by an older format", async () => {
    const key = DraftStore.keyOf("draftTestItem", "id:b", "ident");
    storage.setItem(key, JSON.stringify({ ...record(new Date().toISOString()), v: 0 }));
    expect(await DraftStore.read(key)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  test("removeIdentity clears one identity and leaves the other", async () => {
    const mine = DraftStore.keyOf("draftTestItem", "id:a", "mine");
    const theirs = DraftStore.keyOf("draftTestItem", "id:a", "theirs");
    await DraftStore.write(mine, record(new Date().toISOString()));
    await DraftStore.write(theirs, record(new Date().toISOString()));
    await DraftStore.removeIdentity("mine");
    expect(await DraftStore.read(mine)).toBeNull();
    expect(await DraftStore.read(theirs)).not.toBeNull();
  });

  test("sweep drops what is past the TTL and keeps what is not", async () => {
    const stale = DraftStore.keyOf("draftTestItem", "id:old", "ident");
    const fresh = DraftStore.keyOf("draftTestItem", "id:new", "ident");
    await DraftStore.write(stale, record(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()));
    await DraftStore.write(fresh, record(new Date().toISOString()));
    await DraftStore.sweep();
    expect(await DraftStore.read(stale)).toBeNull();
    expect(await DraftStore.read(fresh)).not.toBeNull();
  });

  test("sweep caps one identity at 30 by savedAt, oldest first", async () => {
    for (let index = 0; index < 33; index += 1) {
      await DraftStore.write(
        DraftStore.keyOf("draftTestItem", `id:${index}`, "ident"),
        record(new Date(Date.now() - (33 - index) * 60_000).toISOString()),
      );
    }
    await DraftStore.sweep();
    expect(await DraftStore.read(DraftStore.keyOf("draftTestItem", "id:0", "ident"))).toBeNull();
    expect(await DraftStore.read(DraftStore.keyOf("draftTestItem", "id:2", "ident"))).toBeNull();
    expect(await DraftStore.read(DraftStore.keyOf("draftTestItem", "id:3", "ident"))).not.toBeNull();
    expect(await DraftStore.read(DraftStore.keyOf("draftTestItem", "id:32", "ident"))).not.toBeNull();
  });

  test("writes nothing at all when storage is unreachable", async () => {
    Reflect.deleteProperty(globalThis, "window");
    await DraftStore.write("akan.draft.drafttest.ident.draftTestItem.id:a", record(new Date().toISOString()));
    expect(await DraftStore.read("akan.draft.drafttest.ident.draftTestItem.id:a")).toBeNull();
  });
});

describe("DraftStore.reconcileIdentity", () => {
  const write = async (identity: string) =>
    await DraftStore.write(DraftStore.keyOf("draftTestItem", "id:a", identity), {
      v: 1,
      savedAt: new Date().toISOString(),
      baseUpdatedAt: null,
      form: { title: "x" },
    });

  test("clears the previous user's drafts once a different user signs in", async () => {
    setCookie(jwtOf({ sub: "u1" }));
    await DraftStore.reconcileIdentity();
    const first = DraftStore.identity();
    await write(first);

    setCookie(jwtOf({ sub: "u2" }));
    await DraftStore.reconcileIdentity();
    expect(await DraftStore.read(DraftStore.keyOf("draftTestItem", "id:a", first))).toBeNull();
  });

  test("keeps them when the same user's token is merely re-issued", async () => {
    setCookie(jwtOf({ sub: "u1", iat: 1 }));
    await DraftStore.reconcileIdentity();
    const identity = DraftStore.identity();
    await write(identity);

    setCookie(jwtOf({ sub: "u1", iat: 999 }));
    await DraftStore.reconcileIdentity();
    expect(await DraftStore.read(DraftStore.keyOf("draftTestItem", "id:a", identity))).not.toBeNull();
  });

  test("never clears anon, which cannot tell two signed-out users apart", async () => {
    await DraftStore.reconcileIdentity();
    await write("anon");
    setCookie(jwtOf({ sub: "u1" }));
    await DraftStore.reconcileIdentity();
    expect(await DraftStore.read(DraftStore.keyOf("draftTestItem", "id:a", "anon"))).not.toBeNull();
  });
});

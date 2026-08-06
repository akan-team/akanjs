import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutoImportSync, transformSource } from "./autoImportSync";

const tempRoots: string[] = [];

const makeTempRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-auto-import-"));
  tempRoots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const constantCtx = { role: "constant", scope: "libs", project: "shared" } as const;
const documentCtx = { role: "document", scope: "libs", project: "shared" } as const;
const serviceCtx = { role: "service", scope: "libs", project: "shared" } as const;
const signalCtx = { role: "signal", scope: "libs", project: "shared" } as const;
const dictionaryCtx = { role: "dictionary", scope: "libs", project: "shared" } as const;
const srvkitCtx = { role: "srvkit", scope: "libs", project: "shared" } as const;
const storeCtx = { role: "store", scope: "libs", project: "shared" } as const;
const clientLibCtx = { role: "client", scope: "libs", project: "shared" } as const;
const clientAppCtx = { role: "client", scope: "apps", project: "akasys" } as const;

describe("transformSource — base scalars (akanjs/base)", () => {
  test("adds a missing scalar as a new import after the last import", () => {
    const source = `import { via } from "akanjs/constant";\n\nexport class A extends via {\n  count = field(Int);\n}\n`;
    const out = transformSource(source, "a.constant.ts", constantCtx);
    expect(out).toBe(
      `import { via } from "akanjs/constant";\nimport { Int } from "akanjs/base";\n\nexport class A extends via {\n  count = field(Int);\n}\n`,
    );
  });

  test("merges into an existing akanjs/base import, sorted case-insensitively", () => {
    const source = `import { dayjs } from "akanjs/base";\n\nconst x = field(Int);\nconst y = field(Any);\n`;
    const out = transformSource(source, "a.document.ts", documentCtx);
    expect(out).toBe(
      `import { Any, dayjs, Int } from "akanjs/base";\n\nconst x = field(Int);\nconst y = field(Any);\n`,
    );
  });

  test("no change when everything used is already imported", () => {
    const source = `import { Int } from "akanjs/base";\n\nconst x = field(Int);\n`;
    expect(transformSource(source, "a.signal.ts", signalCtx)).toBeNull();
  });

  test("ignores JS globals and unknown identifiers (String, Date, Number)", () => {
    const source = `const a = field(String);\nconst b = field(Date);\nconst c = field(Number);\n`;
    expect(transformSource(source, "a.constant.ts", constantCtx)).toBeNull();
  });

  test("does not treat member access as a bare scalar reference", () => {
    const source = `const a = obj.Int;\nconst b = obj.Any;\n`;
    expect(transformSource(source, "a.constant.ts", constantCtx)).toBeNull();
  });

  test("skips a scalar that is locally declared", () => {
    const source = `const Int = 1;\nconst a = Int + 2;\n`;
    expect(transformSource(source, "a.constant.ts", constantCtx)).toBeNull();
  });
});

describe("transformSource — server roles (framework symbols + relative barrels)", () => {
  test("document: merges akanjs/document helpers and adds db/cnst namespaces", () => {
    const source = `import { SchemaOf } from "akanjs/document";\n\nexport const h = () => by("id") && from(db.user) && cnst.User;\n`;
    const out = transformSource(source, "x.document.ts", documentCtx);
    expect(out).toBe(
      `import { by, from, SchemaOf } from "akanjs/document";\nimport * as db from "../db";\nimport * as cnst from "../cnst";\n\nexport const h = () => by("id") && from(db.user) && cnst.User;\n`,
    );
  });

  test("service: resolves serve, db/srv namespaces, DataInputOf and Err", () => {
    const source = `export class S extends serve(srv.user) {\n  async m(x: DataInputOf<"user">) {\n    db.user.get();\n    Err.notFound();\n  }\n}\n`;
    const out = transformSource(source, "x.service.ts", serviceCtx);
    expect(out).not.toBeNull();
    expect(out).toContain(`import { serve } from "akanjs/service";`);
    expect(out).toContain(`import { DataInputOf } from "akanjs/document";`);
    expect(out).toContain(`import { Err } from "../dict";`);
    expect(out).toContain(`import * as db from "../db";`);
    expect(out).toContain(`import * as srv from "../srv";`);
  });

  test("signal: resolves endpoint/internal/Public plus srv/cnst namespaces", () => {
    const source = `export class Sig {\n  a = endpoint(Public).query(cnst.User);\n  b = internal(srv.user);\n}\n`;
    const out = transformSource(source, "x.signal.ts", signalCtx);
    expect(out).toContain(`import { endpoint, internal, Public } from "akanjs/signal";`);
    expect(out).toContain(`import * as srv from "../srv";`);
    expect(out).toContain(`import * as cnst from "../cnst";`);
  });

  test("dictionary: resolves modelDictionary from akanjs/dictionary", () => {
    const source = `export const d = modelDictionary({});\n`;
    expect(transformSource(source, "x.dictionary.ts", dictionaryCtx)).toBe(
      `import { modelDictionary } from "akanjs/dictionary";\n\nexport const d = modelDictionary({});\n`,
    );
  });

  test("srvkit: resolves Logger, adapt and base scalars", () => {
    const source = `export const log = new Logger("x");\nexport const a = adapt(() => dayjs());\n`;
    const out = transformSource(source, "aes.ts", srvkitCtx);
    expect(out).toContain(`import { Logger } from "akanjs/common";`);
    expect(out).toContain(`import { adapt } from "akanjs/service";`);
    expect(out).toContain(`import { dayjs } from "akanjs/base";`);
  });
});

describe("transformSource — type-only imports", () => {
  test("hoists to `import type` when a standalone type symbol is added", () => {
    const source = `export const useRoot = (): RootStore => ({}) as RootStore;\n`;
    const out = transformSource(source, "x.store.ts", storeCtx);
    expect(out).toBe(
      `import type { RootStore } from "../st";\n\nexport const useRoot = (): RootStore => ({}) as RootStore;\n`,
    );
  });

  test("uses inline `type` when a type symbol joins value imports from the same specifier", () => {
    const source = `import { dayjs } from "akanjs/base";\n\nexport const now = (): Dayjs => dayjs();\n`;
    const out = transformSource(source, "x.document.ts", documentCtx);
    expect(out).toBe(`import { type Dayjs, dayjs } from "akanjs/base";\n\nexport const now = (): Dayjs => dayjs();\n`);
  });

  test("no change when a type symbol is already imported", () => {
    const source = `import type { RootStore } from "../st";\n\nexport const x = (): RootStore => ({}) as RootStore;\n`;
    expect(transformSource(source, "x.store.ts", storeCtx)).toBeNull();
  });
});

describe("transformSource — store role (relative barrels)", () => {
  test("adds namespace cnst and named fetch from their respective barrels", () => {
    const source = `import { store } from "akanjs/store";\n\nexport class S extends store {\n  async m() {\n    const a = new cnst.Admin();\n    await fetch.me();\n  }\n}\n`;
    const out = transformSource(source, "s.store.ts", storeCtx);
    expect(out).toBe(
      `import { store } from "akanjs/store";\nimport { fetch } from "../useClient";\nimport * as cnst from "../cnst";\n\nexport class S extends store {\n  async m() {\n    const a = new cnst.Admin();\n    await fetch.me();\n  }\n}\n`,
    );
  });

  test("does not re-add an already-present namespace cnst", () => {
    const source = `import * as cnst from "../cnst";\n\nconst a = new cnst.Admin();\n`;
    expect(transformSource(source, "s.store.ts", storeCtx)).toBeNull();
  });
});

describe("transformSource — client role (package client entry)", () => {
  test("adds client imports below the use client directive when no imports exist", () => {
    const source = `"use client";\n\nexport const C = () => fetch.me() && cnst.Foo;\n`;
    const out = transformSource(source, "C.Unit.tsx", clientLibCtx);
    expect(out).toBe(
      `"use client";\nimport { cnst, fetch } from "@libs/shared/client";\n\nexport const C = () => fetch.me() && cnst.Foo;\n`,
    );
  });

  test("resolves the app client entry for apps files", () => {
    const source = `import { Load } from "akanjs/ui";\n\nexport const C = () => st.foo;\n`;
    const out = transformSource(source, "C.Zone.tsx", clientAppCtx);
    expect(out).toBe(
      `import { Load } from "akanjs/ui";\nimport { st } from "@apps/akasys/client";\n\nexport const C = () => st.foo;\n`,
    );
  });

  test("handles webkit .ts files (no jsx) the same as tsx", () => {
    const source = `import { getEnv } from "akanjs/base";\n\nexport const load = () => fetch.me();\n`;
    const out = transformSource(source, "cookie.ts", clientLibCtx);
    expect(out).toBe(
      `import { getEnv } from "akanjs/base";\nimport { fetch } from "@libs/shared/client";\n\nexport const load = () => fetch.me();\n`,
    );
  });
});

describe("AutoImportSync.syncForBatch", () => {
  const seed = async (root: string, rel: string, content: string) => {
    const abs = path.join(root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
    return abs;
  };

  test("writes the fix once, then is idempotent", async () => {
    const root = await makeTempRoot();
    const abs = await seed(
      root,
      "libs/shared/lib/foo/foo.constant.ts",
      `import { via } from "akanjs/constant";\n\nconst x = field(Int);\n`,
    );
    const sync = new AutoImportSync({ workspaceRoot: root });

    const first = await sync.syncForBatch([abs]);
    expect(first.errors).toEqual([]);
    expect(first.changedFiles).toEqual([abs]);
    expect(await readFile(abs, "utf8")).toContain(`import { Int } from "akanjs/base";`);

    const second = await sync.syncForBatch([abs]);
    expect(second.changedFiles).toEqual([]);
  });

  test("skips files outside a known facet and test files", async () => {
    const root = await makeTempRoot();
    const outside = await seed(root, "libs/shared/foo.constant.ts", `const x = field(Int);\n`);
    const testFile = await seed(root, "libs/shared/lib/foo/foo.constant.test.ts", `const x = field(Int);\n`);
    const scriptFile = await seed(root, "libs/shared/script/foo.ts", `const x = dayjs();\n`);
    const sync = new AutoImportSync({ workspaceRoot: root });

    const result = await sync.syncForBatch([outside, testFile, scriptFile]);
    expect(result.changedFiles).toEqual([]);
    expect(await readFile(outside, "utf8")).not.toContain("akanjs/base");
    expect(await readFile(testFile, "utf8")).not.toContain("akanjs/base");
    expect(await readFile(scriptFile, "utf8")).not.toContain("akanjs/base");
  });

  test("common facet resolves base scalars, lib barrels and domain refs", async () => {
    const root = await makeTempRoot();
    await seed(root, "libs/x/lib/cnst.ts", `export const x = 1;\n`);
    await seed(root, "libs/x/lib/character/character.constant.ts", `export class Character extends via {}\n`);
    const common = await seed(
      root,
      "libs/x/common/helper.ts",
      `export const f = (c: Character) => dayjs() && cnst.Foo && c;\n`,
    );
    const sync = new AutoImportSync({ workspaceRoot: root });

    const result = await sync.syncForBatch([common]);
    expect(result.errors).toEqual([]);
    const out = await readFile(common, "utf8");
    expect(out).toContain(`import { dayjs } from "akanjs/base";`);
    expect(out).toContain(`import * as cnst from "../lib/cnst";`);
    expect(out).toContain(`import { Character } from "../lib/character/character.constant";`);
  });

  test("routes the srvkit facet and skips its generated index.ts", async () => {
    const root = await makeTempRoot();
    const aes = await seed(root, "libs/shared/srvkit/aes.ts", `export const log = new Logger("x");\n`);
    const index = await seed(root, "libs/shared/srvkit/index.ts", `export * from "./aes";\nconst x = Logger;\n`);
    const sync = new AutoImportSync({ workspaceRoot: root });

    const result = await sync.syncForBatch([aes, index]);
    expect(result.changedFiles).toEqual([aes]);
    expect(await readFile(aes, "utf8")).toContain(`import { Logger } from "akanjs/common";`);
    expect(await readFile(index, "utf8")).not.toContain("akanjs/common");
  });

  test("covers ui/page tsx and webkit ts, and resolves the app client entry", async () => {
    const root = await makeTempRoot();
    const uiFile = await seed(root, "apps/akan/ui/Card.tsx", `"use client";\n\nexport const C = () => st.foo;\n`);
    const pageFile = await seed(root, "apps/akan/page/(user)/home/_index.tsx", `export default () => cnst.Foo;\n`);
    const webkitFile = await seed(root, "libs/shared/webkit/cookie.ts", `export const load = () => fetch.me();\n`);
    const sync = new AutoImportSync({ workspaceRoot: root });

    const result = await sync.syncForBatch([uiFile, pageFile, webkitFile]);
    expect(result.errors).toEqual([]);
    expect(result.changedFiles.sort()).toEqual([pageFile, webkitFile, uiFile].sort());
    expect(await readFile(uiFile, "utf8")).toContain(`import { st } from "@apps/akan/client";`);
    expect(await readFile(pageFile, "utf8")).toContain(`import { cnst } from "@apps/akan/client";`);
    expect(await readFile(webkitFile, "utf8")).toContain(`import { fetch } from "@libs/shared/client";`);
  });

  test("resolves domain model/scalar refs from sibling files in a constant", async () => {
    const root = await makeTempRoot();
    await seed(root, "libs/x/lib/file/file.constant.ts", `export class File extends via {}\n`);
    await seed(root, "libs/x/lib/__scalar/encourageInfo/encourageInfo.constant.ts", `export class EncourageInfo {}\n`);
    const user = await seed(
      root,
      "libs/x/lib/user/user.constant.ts",
      `import { via } from "akanjs/constant";\n\nexport class User extends via {\n  file = field(File);\n  info = field(EncourageInfo);\n}\n`,
    );
    const sync = new AutoImportSync({ workspaceRoot: root });

    const result = await sync.syncForBatch([user]);
    expect(result.errors).toEqual([]);
    const out = await readFile(user, "utf8");
    expect(out).toContain(`import { File } from "../file/file.constant";`);
    expect(out).toContain(`import { EncourageInfo } from "../__scalar/encourageInfo/encourageInfo.constant";`);
  });

  test("dictionary resolves same-folder .constant/.document/.signal refs", async () => {
    const root = await makeTempRoot();
    await seed(root, "libs/x/lib/user/user.constant.ts", `export class User extends via {}\n`);
    await seed(root, "libs/x/lib/user/user.document.ts", `export class UserFilter {}\n`);
    await seed(root, "libs/x/lib/user/user.signal.ts", `export class UserEndpoint {}\n`);
    const dict = await seed(
      root,
      "libs/x/lib/user/user.dictionary.ts",
      `export const d = modelDictionary(User, UserFilter, UserEndpoint);\n`,
    );
    const sync = new AutoImportSync({ workspaceRoot: root });

    await sync.syncForBatch([dict]);
    const out = await readFile(dict, "utf8");
    expect(out).toContain(`import { modelDictionary } from "akanjs/dictionary";`);
    expect(out).toContain(`import { User } from "./user.constant";`);
    expect(out).toContain(`import { UserFilter } from "./user.document";`);
    expect(out).toContain(`import { UserEndpoint } from "./user.signal";`);
  });

  test("leaves JS globals and ambiguous domain names alone", async () => {
    const root = await makeTempRoot();
    // `Map` is a real model here but must not shadow the JS global.
    await seed(root, "libs/x/lib/map/map.constant.ts", `export class Map extends via {}\n`);
    // `Dup` is exported by two files → ambiguous → skipped.
    await seed(root, "libs/x/lib/a/a.constant.ts", `export class Dup {}\n`);
    await seed(root, "libs/x/lib/b/b.constant.ts", `export class Dup {}\n`);
    const consumer = await seed(
      root,
      "libs/x/lib/user/user.constant.ts",
      `import { via } from "akanjs/constant";\n\nexport class User extends via {\n  m() {\n    const x = new Map();\n    return Dup;\n  }\n}\n`,
    );
    const sync = new AutoImportSync({ workspaceRoot: root });

    const result = await sync.syncForBatch([consumer]);
    expect(result.changedFiles).toEqual([]);
    const out = await readFile(consumer, "utf8");
    expect(out).not.toContain("map.constant");
    expect(out).not.toContain("a.constant");
    expect(out).not.toContain("b.constant");
  });

  test("srvkit: resolves lib barrels relative to file depth", async () => {
    const root = await makeTempRoot();
    for (const barrel of ["dict", "db", "cnst"]) await seed(root, `libs/x/lib/${barrel}.ts`, `export const x = 1;\n`);
    const shallow = await seed(root, "libs/x/srvkit/api.ts", `export const f = () => Err.of(cnst.User, db.user);\n`);
    const deep = await seed(root, "libs/x/srvkit/a/b/api.ts", `export const g = () => Err.of(cnst.User);\n`);
    const sync = new AutoImportSync({ workspaceRoot: root });

    await sync.syncForBatch([shallow, deep]);
    const shallowOut = await readFile(shallow, "utf8");
    expect(shallowOut).toContain(`import { Err } from "../lib/dict";`);
    expect(shallowOut).toContain(`import * as cnst from "../lib/cnst";`);
    expect(shallowOut).toContain(`import * as db from "../lib/db";`);
    const deepOut = await readFile(deep, "utf8");
    expect(deepOut).toContain(`import { Err } from "../../../lib/dict";`);
    expect(deepOut).toContain(`import * as cnst from "../../../lib/cnst";`);
  });

  test("srvkit: does not import a barrel whose file is absent", async () => {
    const root = await makeTempRoot();
    await seed(root, "libs/x/lib/dict.ts", `export const x = 1;\n`); // no lib/srv.ts
    const file = await seed(root, "libs/x/srvkit/api.ts", `export const f = () => Err.of(srv.user);\n`);
    const sync = new AutoImportSync({ workspaceRoot: root });

    await sync.syncForBatch([file]);
    const out = await readFile(file, "utf8");
    expect(out).toContain(`import { Err } from "../lib/dict";`);
    expect(out).not.toContain("lib/srv");
  });

  test("skips generated webkit index.ts", async () => {
    const root = await makeTempRoot();
    const indexFile = await seed(root, "libs/shared/webkit/index.ts", `export * from "./cookie";\nconst x = fetch;\n`);
    const sync = new AutoImportSync({ workspaceRoot: root });

    const result = await sync.syncForBatch([indexFile]);
    expect(result.changedFiles).toEqual([]);
    expect(await readFile(indexFile, "utf8")).not.toContain("@libs/shared/client");
  });
});

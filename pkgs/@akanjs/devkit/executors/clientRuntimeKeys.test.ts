import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdir, readdir, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Logger } from "akanjs/common";
import { type RuntimeFamily, RuntimeNameTable, runtimeFamilies } from "../quality/runtimeNameTable";
import { RuntimeUse } from "../quality/runtimeUse";
import { createTempApp, tempRoots, writeJson, writeText } from "../test/testHelpers";
import { RouteRuntime } from "../transforms/routeRuntime";

const trackRoot = tempRoots();
const akanjsRoot = path.resolve(import.meta.dir, "../../../akanjs");
const recordedPath = path.join(import.meta.dir, "clientRuntimeKeys.fixture.json");
const baseModules = ["agent", "base"];
const howToRecord =
  "The keys an app's whole client runtime answers no longer match clientRuntimeKeys.fixture.json. If the change is " +
  "intended, record them with AKAN_RECORD_CLIENT_RUNTIME_KEYS=1 bun test --isolate ./executors/clientRuntimeKeys.test.ts " +
  "and review the fixture's diff.";

const option = `import { AkanOption } from "akanjs/server";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & { [key: string]: unknown };

export const option = new AkanOption<ModulesOptions>();
`;

const kitFiles: Record<string, string> = {
  "common/kitLabel.ts": 'export const kitLabel = "kit";\n',
  "lib/option.ts": option,
  "lib/item/item.constant.ts": `import { via } from "akanjs/constant";

export class ItemInput extends via((field) => ({
  name: field(String),
})) {}

export class ItemObject extends via(ItemInput, (field) => ({})) {}

export class LightItem extends via(ItemObject, ["name"] as const, (resolve) => ({})) {}

export class Item extends via(ItemObject, LightItem, (resolve) => ({})) {}

export class ItemInsight extends via(Item, (field) => ({})) {}
`,
  "lib/item/item.dictionary.ts": `import { modelDictionary } from "akanjs/dictionary";

import type { Item, ItemInsight } from "./item.constant";
import type { ItemFilter } from "./item.document";
import type { ItemEndpoint, ItemSlice } from "./item.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Item", "아이템"]).desc(["Something listed", "목록의 항목"]))
  .model<Item>((t) => ({
    name: t(["Name", "이름"]).desc(["What the item is called", "항목 이름"]),
  }))
  .insight<ItemInsight>((t) => ({}))
  .query<ItemFilter>((fn) => ({}))
  .sort<ItemFilter>((t) => ({}))
  .slice<ItemSlice>((fn) => ({
    inPublic: fn(["Item In Public", "공개 항목"]).desc(["Every item", "모든 항목"]).arg((t) => ({})),
  }))
  .endpoint<ItemEndpoint>((fn) => ({
    itemCount: fn(["Item Count", "항목 수"]).desc(["How many items there are", "항목 수"]),
  }))
  .translate({});
`,
  "lib/item/item.document.ts": `import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";

export class ItemFilter extends from(cnst.Item, (filter) => ({ query: {}, sort: {} })) {}

export class Item extends by(cnst.Item) {}

export class ItemModel extends into(Item, ItemFilter, cnst.item, () => ({})) {}
`,
  "lib/item/item.service.ts": `import { serve } from "akanjs/service";

import * as db from "../db";

export class ItemService extends serve(db.item, () => ({})) {}
`,
  "lib/item/item.signal.ts": `import { Int } from "akanjs/base";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as srv from "../srv";

export class ItemInternal extends internal(srv.item, () => ({})) {}

export class ItemSlice extends slice(
  srv.item,
  { guards: { root: Public, get: Public, cru: Public }, mcp: false },
  (init) => ({
    inPublic: init({ guards: [Public], mcp: false }).exec(function () {
      return this.itemService.queryAny();
    }),
  }),
) {}

export class ItemEndpoint extends endpoint(srv.item, ({ query }) => ({
  itemCount: query(Int, { guards: [Public], mcp: false }).exec(() => 0),
})) {}
`,
  "lib/item/item.store.ts": `import { store } from "akanjs/store";

import { fetch, sig } from "../useClient";

export class ItemStore extends store(sig.item, () => ({ itemCount: 0 })) {
  async refreshItemCount() {
    this.set({ itemCount: await fetch.itemCount() });
  }
}
`,
};

const demoFiles: Record<string, string> = {
  "lib/option.ts": option,
  "lib/item/item.constant.ts": `import { via } from "akanjs/constant";

import { item } from "../__lib/lib.constant";

export class ItemInput extends via((field) => ({}), ...item.inputs) {}

export class ItemObject extends via(ItemInput, (field) => ({ note: field(String, { default: "" }) }), ...item.objects) {}

export class LightItem extends via(ItemObject, ["note"] as const, (resolve) => ({}), ...item.lights) {}

export class Item extends via(ItemObject, LightItem, (resolve) => ({}), ...item.models) {}

export class ItemInsight extends via(Item, (field) => ({}), ...item.insights) {}
`,
  "lib/item/item.dictionary.ts": `import { modelDictionary } from "akanjs/dictionary";

import { item } from "../__lib/lib.dictionary";
import type { Item } from "./item.constant";
import type { ItemEndpoint, ItemSlice } from "./item.signal";

export const dictionary = modelDictionary(["en", "ko"], ...item.dictionaries)
  .model<Item>((t) => ({
    note: t(["Note", "메모"]).desc(["What the app adds to an item", "앱이 항목에 덧붙이는 메모"]),
  }))
  .slice<ItemSlice>((fn) => ({
    withNote: fn(["Item With Note", "메모가 있는 항목"]).desc(["Items with a note", "메모가 있는 항목"]).arg((t) => ({})),
  }))
  .endpoint<ItemEndpoint>((fn) => ({
    itemNote: fn(["Item Note", "항목 메모"]).desc(["The note of the latest item", "최근 항목의 메모"]),
  }))
  .translate({});
`,
  "lib/item/item.document.ts": `import { by, from, into } from "akanjs/document";

import { item } from "../__lib/lib.document";
import * as cnst from "../cnst";

export class ItemFilter extends from(cnst.Item, (filter) => ({ query: {}, sort: {} }), ...item.filters) {}

export class Item extends by(cnst.Item, ...item.docs) {}

export class ItemModel extends into(Item, ItemFilter, cnst.item, () => ({}), ...item.models) {}
`,
  "lib/item/item.service.ts": `import { serve } from "akanjs/service";

import { item } from "../__lib/lib.service";
import * as db from "../db";

export class ItemService extends serve(db.item, () => ({}), ...item.services) {}
`,
  "lib/item/item.signal.ts": `import { endpoint, internal, Public, slice } from "akanjs/signal";

import { item } from "../__lib/lib.signal";
import * as srv from "../srv";

export class ItemInternal extends internal(srv.item, () => ({}), ...item.internals) {}

export class ItemSlice extends slice(
  srv.item,
  { guards: { root: Public, get: Public, cru: Public }, mcp: false },
  (init) => ({
    withNote: init({ guards: [Public], mcp: false }).exec(function () {
      return this.itemService.queryAny();
    }),
  }),
  ...item.slices,
) {}

export class ItemEndpoint extends endpoint(
  srv.item,
  ({ query }) => ({
    itemNote: query(String, { guards: [Public], mcp: false }).exec(() => ""),
  }),
  ...item.endpoints,
) {}
`,
  "lib/item/item.store.ts": `import { store } from "akanjs/store";

import { item } from "../__lib/lib.store";
import { fetch, sig } from "../useClient";

export class ItemStore extends store(sig.item, () => ({ noteDraft: "" }), ...item.stores) {
  async loadItemNote() {
    this.set({ noteDraft: await fetch.itemNote() });
  }
}
`,
  "lib/_demo/demo.dictionary.ts": `import { serviceDictionary } from "akanjs/dictionary";

import type { DemoEndpoint } from "./demo.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<DemoEndpoint>((fn) => ({
    ping: fn(["Ping", "핑"]),
  }))
  .translate({});
`,
  "lib/_demo/demo.service.ts": `import { serve } from "akanjs/service";

export class DemoService extends serve("demo" as const, () => ({})) {}
`,
  "lib/_demo/demo.signal.ts": `import { endpoint, internal, Public } from "akanjs/signal";

import * as srv from "../srv";

export class DemoInternal extends internal(srv.demo, () => ({})) {}

export class DemoEndpoint extends endpoint(srv.demo, ({ query }) => ({
  ping: query(String, { guards: [Public], mcp: false }).exec(() => "pong"),
})) {}
`,
  "lib/_demo/demo.store.ts": `import { kitLabel } from "@libs/kit/common";
import { store } from "akanjs/store";

export class DemoStore extends store("demo" as const, () => ({ label: kitLabel })) {
  pickLabel(label: string) {
    this.set({ label });
  }
}
`,
};

const kitModuleNamed = (name: string, Name: string) =>
  Object.fromEntries(
    Object.entries(kitFiles)
      .filter(([file]) => file.startsWith("lib/item/"))
      .map(([file, content]) => [
        file.replaceAll("item", name),
        content.replaceAll("item", name).replaceAll("Item", Name),
      ]),
  );

const keysScript = `
import { FetchClient } from "akanjs/fetch";
const { fetch, sig } = await import("./apps/demo/lib/useClient.ts");
const { st } = await import("./apps/demo/lib/st.ts");
const sorted = (keys) => [...new Set(keys)].sort();
const serializedSignal = fetch.serializedSignal;
const handlers = Object.entries(serializedSignal).flatMap(([refName, signal]) =>
  FetchClient.claimsOf(refName, signal).handlers.map(({ key }) => key),
);
console.log(JSON.stringify({
  "st.do": sorted(Object.keys(st.do)),
  "st.use": sorted(Object.keys(st.use)),
  "st.slice": sorted(Object.keys(st.slice)),
  "fetch.slice": sorted(Object.keys(fetch.slice)),
  sig: sorted(Object.keys(sig)),
  "fetch.serializedSignal": sorted(Object.keys(serializedSignal)),
  "FetchClient.claimsOf": sorted(handlers),
}));
`;

const moduleKeysScript = `
import { FetchClient } from "akanjs/fetch";
import { StoreInstance, StoreRegistry } from "akanjs/store";
const { fetch, sig } = await import("./apps/demo/lib/useClient.ts");
await import("./apps/demo/lib/st.ts");
const modules = {};
const add = (refName, family, keys) => ((modules[refName] ??= {})[family] ??= []).push(...keys);
for (const [refName, store] of StoreRegistry.stores) {
  const own = new StoreInstance(StoreRegistry.merge("own", store));
  for (const family of ["do", "use", "slice"]) add(refName, "st." + family, Object.keys(own[family]));
}
for (const [refName, signal] of Object.entries(fetch.serializedSignal))
  add(refName, "fetch", FetchClient.claimsOf(refName, signal).handlers.map(({ key }) => key));
for (const [key, { refName }] of Object.entries(fetch.slice)) add(refName, "fetch.slice", [key]);
for (const refName of Object.keys(fetch.serializedSignal)) add(refName, "fetch.serializedSignal", [refName]);
for (const refName of Object.keys(sig)) add(refName, "sig", [refName]);
console.log(JSON.stringify(modules));
`;

const browserScript = `
Object.assign(globalThis, { window: globalThis, location: new URL("http://localhost:4200/") });
const { FetchClient } = await import("akanjs/fetch");
const app = await import("./apps/demo/lib/useClient.ts");
const lib = await import("./libs/kit/lib/useClient.ts");
const tab = FetchClient.build({}, {}).fetch;
console.log(JSON.stringify({
  appIsTab: app.fetch === tab,
  libIsTab: lib.fetch === tab,
  "fetch.slice": Object.keys(tab.slice).sort(),
}));
`;

const pageModuleFiles: Record<string, string> = {
  ...kitModuleNamed("page", "Page"),
  "lib/page/Page.Unit.tsx": "export const Card = () => null;\n",
};

const clientBarrelScript = `
const { Page, st, usePage } = await import("./apps/site/client.ts");
console.log(JSON.stringify({ unit: typeof Page.Unit.Card, store: typeof st.do.refreshPageCount, usePage: typeof usePage }));
`;

const writeWorkspace = async ({
  app = "demo",
  lib = "kit",
  libFiles = { ...kitFiles, ...kitModuleNamed("tag", "Tag") },
  appFiles = demoFiles,
  kept = false,
} = {}) => {
  const created = await createTempApp(app, await realpath(os.tmpdir()));
  const temp = kept ? created : trackRoot(created);
  const { root } = temp;
  const libDir = path.join(root, "libs", lib);
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  await symlink(akanjsRoot, path.join(root, "node_modules/akanjs"));
  await writeJson(path.join(root, "tsconfig.json"), {
    compilerOptions: { target: "ESNext", paths: { "@apps/*": ["./apps/*"], "@libs/*": ["./libs/*"] } },
    references: [],
  });
  for (const dir of [path.join(root, "apps", app), libDir])
    await writeJson(path.join(dir, "tsconfig.json"), { extends: "../../tsconfig.json" });
  await writeJson(path.join(libDir, "package.json"), { type: "module", name: `@${lib}`, version: "0.0.1" });
  await writeText(path.join(libDir, "akan.config.ts"), "export default {};\n");
  await writeText(path.join(libDir, "lib/__scalar/.keep"), "");
  for (const [file, content] of Object.entries(libFiles)) await writeText(path.join(libDir, file), content);
  for (const [file, content] of Object.entries(appFiles)) await writeText(path.join(root, "apps", app, file), content);
  await temp.app.scan();
  return temp;
};

let demoRoot: Promise<string> | null = null;
const demoWorkspace = () => {
  demoRoot ??= writeWorkspace({ kept: true }).then(({ root }) => root);
  return demoRoot;
};
afterAll(async () => {
  if (demoRoot) await rm(await demoRoot, { recursive: true, force: true });
});

//? The scan caches each app and lib by name for the process, so a second `demo` or `kit` would reuse the first's.
const writePageWorkspace = async () => {
  const temp = trackRoot(await createTempApp("site", await realpath(os.tmpdir())));
  const { root } = temp;
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  await symlink(akanjsRoot, path.join(root, "node_modules/akanjs"));
  await writeJson(path.join(root, "tsconfig.json"), {
    compilerOptions: { target: "ESNext", paths: { "@apps/*": ["./apps/*"] } },
    references: [],
  });
  await writeJson(path.join(root, "apps/site/tsconfig.json"), { extends: "../../tsconfig.json" });
  for (const [file, content] of Object.entries({ "lib/option.ts": option, ...pageModuleFiles }))
    await writeText(path.join(root, "apps/site", file), content);
  await temp.app.scan();
  return root;
};

const evaluate = async (root: string, script: string, appName = "demo") => {
  const proc = Bun.spawn([process.execPath, "-e", script], {
    cwd: root,
    env: {
      ...process.env,
      AKAN_PUBLIC_APP_NAME: appName,
      AKAN_PUBLIC_REPO_NAME: "repo",
      AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
      AKAN_PUBLIC_ENV: "local",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`the generated runtime did not load:\n${stderr}`);
  return JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}") as Record<string, unknown>;
};

describe("an app's whole client runtime", () => {
  test("answers the same store, fetch and signal keys as recorded, and in a browser shares the tab's one fetch client with its lib", async () => {
    const root = await demoWorkspace();
    const keys = await evaluate(root, keysScript);
    if (process.env.AKAN_RECORD_CLIENT_RUNTIME_KEYS === "1")
      await Bun.write(recordedPath, `${JSON.stringify(keys, null, 2)}\n`);
    expect(keys, howToRecord).toEqual(await Bun.file(recordedPath).json());
    expect(await evaluate(root, browserScript)).toEqual({
      appIsTab: true,
      libIsTab: true,
      "fetch.slice": ["item", "itemInPublic", "itemWithNote", "tag", "tagInPublic"],
    });
  }, 120_000);

  test("loads from the client barrel when a database module is named page, its UI and store included", async () => {
    const loaded = await evaluate(await writePageWorkspace(), clientBarrelScript, "site");
    expect(loaded).toEqual({ unit: "function", store: "function", usePage: "function" });
  }, 120_000);
});

describe("the client runtime name table", () => {
  test("reads from source every name the whole runtime answers, each owned by the module whose own runtime answers it", async () => {
    const root = await demoWorkspace();
    const table = await RuntimeNameTable.read(root, "apps/demo");
    if (!table) throw new Error("the demo app has no generated client runtime");
    const recorded = (await Bun.file(recordedPath).json()) as Record<string, string[]>;
    expect(Object.fromEntries(runtimeFamilies.map((family) => [family, table.keysOf(family)]))).toEqual(
      Object.fromEntries(
        runtimeFamilies.map((family) => [family, recorded[family === "fetch" ? "FetchClient.claimsOf" : family]]),
      ),
    );
    const modules = (await evaluate(root, moduleKeysScript)) as Record<
      string,
      Partial<Record<RuntimeFamily, string[]>>
    >;
    const answeredByBase = (family: RuntimeFamily, key: string) =>
      baseModules.some((module) => modules[module]?.[family]?.includes(key));
    const misses = runtimeFamilies.flatMap((family) => [
      ...table.keysOf(family).flatMap((key) => {
        const entry = table.lookup(family, key);
        return [
          ...(entry?.base && !answeredByBase(family, key)
            ? [`${family}.${key} is a base name no base runtime has`]
            : []),
          ...(entry?.owners ?? [])
            .filter(({ module }) => !modules[module]?.[family]?.includes(key))
            .map(({ scope, module }) => `${family}.${key} is owned by ${scope}/${module}, whose own runtime lacks it`),
        ];
      }),
      ...Object.entries(modules).flatMap(([refName, keys]) =>
        (keys[family] ?? [])
          .filter((key) => {
            const entry = table.lookup(family, key);
            return baseModules.includes(refName)
              ? !entry?.base
              : !entry?.owners.some(({ module }) => module === refName);
          })
          .map((key) => `${family}.${key} is answered by ${refName}'s own runtime, which does not own it`),
      ),
    ]);
    expect(misses).toEqual([]);
    const owners = runtimeFamilies.flatMap((family) =>
      table.keysOf(family).flatMap((key) => table.lookup(family, key)?.owners ?? []),
    );
    expect([...new Set(owners.map(({ scope, module }) => `${scope}/${module}`))].sort()).toEqual([
      "apps/demo/demo",
      "apps/demo/item",
      "libs/kit/tag",
    ]);
  }, 120_000);
});

const serviceFiles = (name: string, endpointName: string): Record<string, string> => {
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  return {
    [`lib/_${name}/${name}.dictionary.ts`]: `import { serviceDictionary } from "akanjs/dictionary";

import type { ${Name}Endpoint } from "./${name}.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<${Name}Endpoint>((fn) => ({
    ${endpointName}: fn(["${Name}", "${Name}"]),
  }))
  .translate({});
`,
    [`lib/_${name}/${name}.service.ts`]: `import { serve } from "akanjs/service";

export class ${Name}Service extends serve("${name}" as const, () => ({})) {}
`,
    [`lib/_${name}/${name}.signal.ts`]: `import { endpoint, internal, Public } from "akanjs/signal";

import * as srv from "../srv";

export class ${Name}Internal extends internal(srv.${name}, () => ({})) {}

export class ${Name}Endpoint extends endpoint(srv.${name}, ({ query }) => ({
  ${endpointName}: query(String, { guards: [Public], mcp: false }).exec(() => ""),
})) {}
`,
  };
};

//? `audit` follows `item` in the lib's signal, so an app that extends `item` shows whether its pieces keep that order.
const stockFiles = { ...kitFiles, ...serviceFiles("audit", "auditTrail") };
const shopFilesOf = (lib: string) => ({
  ...Object.fromEntries(
    Object.entries(demoFiles).map(([file, content]) => [file, content.replaceAll("@libs/kit/", `@libs/${lib}/`)]),
  ),
  ...serviceFiles("ping", "pingAt"),
  "lib/_note/note.dictionary.ts": `import { serviceDictionary } from "akanjs/dictionary";

export const dictionary = serviceDictionary(["en", "ko"]).translate({});
`,
  "lib/_note/note.store.ts": `import { store } from "akanjs/store";

export class NoteStore extends store("note" as const, () => ({ noteText: "" })) {}
`,
});
const writeShopWorkspace = (app: string, lib: string) =>
  writeWorkspace({ app, lib, libFiles: stockFiles, appFiles: shopFilesOf(lib) });

//? Rewrites files instead of redirecting with a runtime `Bun.plugin`, under which Bun 1.4 leaves macro calls un-inlined.
const pointScopes = async (root: string, scopes: string[], targets: Record<string, string>) => {
  for (const scope of scopes)
    for (const [file, target] of Object.entries(targets))
      await writeText(path.join(root, scope, "lib", file), `export * from "${target}";\n`);
};

const runtimeKeysScript = (app: string, { browser = false } = {}) => `
${browser ? `Object.assign(globalThis, { window: globalThis, location: new URL("http://localhost:4200/") });\n` : ""}const { FetchClient } = await import("akanjs/fetch");
const { fetch, sig } = await import("./apps/${app}/lib/useClient.ts");
const { st } = await import("./apps/${app}/lib/st.ts");
const serializedSignal = fetch.serializedSignal;
console.log(JSON.stringify({
  "st.get": Object.keys(st.get()),
  "st.do": Object.keys(st.do),
  "st.use": Object.keys(st.use),
  "st.slice": Object.keys(st.slice),
  "fetch.slice": Object.keys(fetch.slice),
  sig: Object.keys(sig),
  "fetch.serializedSignal": Object.keys(serializedSignal),
  "FetchClient.claimsOf": Object.entries(serializedSignal).flatMap(([refName, signal]) =>
    FetchClient.claimsOf(refName, signal).handlers.map(({ key }) => key),
  ),
}));
`;

const lonePieceScript = (app: string, lib: string, piece: string) => `
const { StoreRegistry, st } = await import("akanjs/store");
const storesBefore = new Set(StoreRegistry.stores.keys());
await import("./apps/${app}/lib/__client/${piece}.st.ts");
const appPage = await import("./apps/${app}/lib/usePage.ts");
const libPage = await import("./libs/${lib}/lib/usePage.ts");
const moduleActions = ["pickLabel", "loadItemNote", "refreshItemCount"];
const moduleState = ["label", "noteDraft", "itemCount", "noteText"];
console.log(JSON.stringify({
  stores: [...StoreRegistry.stores.keys()].filter((key) => !storesBefore.has(key)),
  actions: moduleActions.filter((key) => key in st.do),
  state: moduleState.filter((key) => key in st.get()),
  appSignal: Object.keys(appPage.fetch.ownSerializedSignal),
  libSignal: Object.keys(libPage.fetch.ownSerializedSignal),
}));
`;

const basePieceScript = (app: string) => `
const { ConstantRegistry } = await import("akanjs/constant");
const { fetch } = await import("./apps/${app}/lib/usePage.ts");
await import("./apps/${app}/lib/__client/_base.fetch.ts");
console.log(JSON.stringify({
  signal: Object.keys(fetch.ownSerializedSignal),
  ping: typeof fetch.ping,
  constants: ["item"].filter((name) => ConstantRegistry.getDatabase(name, { allowEmpty: true })),
}));
`;

const keptByWholeScript = (app: string) => `
const { st } = await import("akanjs/store");
await import("./apps/${app}/lib/__client/demo.st.ts");
const pickLabel = st.do.pickLabel;
await pickLabel("picked");
await import("./apps/${app}/lib/st.ts");
console.log(JSON.stringify({ samePickLabel: st.do.pickLabel === pickLabel, label: st.get().label }));
`;

const appStoreAloneScript = (app: string) => `
const { StoreRegistry } = await import("akanjs/store");
const { ItemStore } = await import("./apps/${app}/lib/item/item.store.ts");
StoreRegistry.register(ItemStore);
const actions = ItemStore[Symbol.for("akan.action")];
console.log(JSON.stringify({ actions: ["refreshItemCount", "loadItemNote"].filter((key) => key in actions) }));
`;

const orderPath = path.join(import.meta.dir, "clientRuntimeKeyOrder.fixture.json");
const howToRecordOrder =
  "The order of the keys an app's whole client runtime answers no longer matches clientRuntimeKeyOrder.fixture.json. " +
  "If the change is intended, record it with AKAN_RECORD_CLIENT_RUNTIME_KEYS=1 and review the fixture's diff.";

//? A workspace per test: the temp root goes after each test, and the scan caches an app or lib by name.
const uploadFilesOf = () => {
  const file = kitModuleNamed("file", "File");
  const user = kitModuleNamed("user", "User");
  return {
    ...stockFiles,
    ...file,
    ...user,
    "lib/file/file.signal.ts": (file["lib/file/file.signal.ts"] ?? "")
      .replace('import { Int } from "akanjs/base";', 'import { Int, Upload } from "akanjs/base";')
      .replace('import * as srv from "../srv";', 'import * as cnst from "../cnst";\nimport * as srv from "../srv";')
      .replace("({ query }) => ({", "({ query, mutation }) => ({")
      .replace(
        "  fileCount:",
        `  addFiles: mutation([cnst.File], { guards: [Public], fileUpload: true, mcp: false })
    .body("files", [Upload])
    .exec(() => []),
  fileCount:`,
      ),
    "lib/user/user.constant.ts": (user["lib/user/user.constant.ts"] ?? "")
      .replace(
        'import { via } from "akanjs/constant";',
        'import { via } from "akanjs/constant";\n\nimport { File } from "../file/file.constant";',
      )
      .replace("  name: field(String),", "  name: field(String),\n  image: field(File, { nullable: true }),"),
  };
};

const uploadSetterScript = (lib: string) => `
const { st } = await import("akanjs/store");
await import("./libs/${lib}/lib/__client/user.st.ts");
const page = await import("./libs/${lib}/lib/usePage.ts");
console.log(JSON.stringify({
  upload: typeof st.do.uploadImageOnUser,
  signal: Object.keys(page.fetch.ownSerializedSignal).sort(),
}));
`;

const routeRuntimeScript = (app: string, pieces: string[]) => `
const { StoreRegistry } = await import("akanjs/store");
const storesBefore = new Set(StoreRegistry.stores.keys());
${pieces.map((piece) => `await import("./${piece}.ts");`).join("\n")}
const page = await import("./apps/${app}/lib/usePage.ts");
console.log(JSON.stringify({
  stores: [...StoreRegistry.stores.keys()].filter((key) => !storesBefore.has(key)).sort(),
  signal: Object.keys(page.fetch.ownSerializedSignal).sort(),
}));
`;

describe("an app's client runtime pieces", () => {
  test("leave the whole client runtime answering its keys in the order it did before the pieces, in a browser and outside one", async () => {
    const { root } = await writeShopWorkspace("bazaar", "crate");
    const order = {
      node: await evaluate(root, runtimeKeysScript("bazaar"), "bazaar"),
      browser: await evaluate(root, runtimeKeysScript("bazaar", { browser: true }), "bazaar"),
    };
    if (process.env.AKAN_RECORD_CLIENT_RUNTIME_KEYS === "1")
      await Bun.write(orderPath, `${JSON.stringify(order, null, 2)}\n`);
    expect(order, howToRecordOrder).toEqual(await Bun.file(orderPath).json());
  }, 120_000);

  test("give each module a fetch piece for its signal and a store piece for its store, and leave with the module", async () => {
    const { root, app } = await writeShopWorkspace("shop", "stock");
    const appPieces = path.join(root, "apps/shop/lib/__client");
    const read = (file: string) => Bun.file(path.join(appPieces, file)).text();
    const scopePieces = ["_base.fetch.ts", "_st.ts", "_useClient.ts", "audit.fetch.ts"];
    const modulePieces = ["demo.fetch.ts", "demo.st.ts", "item.fetch.ts", "item.st.ts", "note.st.ts"];
    expect((await readdir(appPieces)).sort()).toEqual([...scopePieces, ...modulePieces, "ping.fetch.ts"]);
    expect((await readdir(path.join(root, "libs/stock/lib/__client"))).sort()).toEqual([
      ...scopePieces,
      "item.fetch.ts",
      "item.st.ts",
    ]);
    expect(await read("_base.fetch.ts")).not.toContain("@libs/");
    expect(await read("_base.fetch.ts")).toContain('getSerializedSignalOf("base")');
    expect(await read("audit.fetch.ts")).toContain('import "@libs/stock/lib/__client/audit.fetch";');
    expect(await read("item.fetch.ts")).toContain('import "@libs/stock/lib/__client/item.fetch";');
    expect(await read("ping.fetch.ts")).not.toContain("@libs/");
    expect(await read("ping.fetch.ts")).toContain('getSerializedSignalOf("ping")');
    expect(await read("demo.st.ts")).toContain('import "./demo.fetch";');
    expect(await read("demo.st.ts")).toContain('import { DemoStore } from "../_demo/demo.store";');
    expect(await read("item.st.ts")).toContain(
      'import "@libs/stock/lib/__client/item.st";\nimport { StoreRegistry } from "akanjs/store";\nimport { ItemStore } from "../item/item.store";',
    );
    expect(await read("note.st.ts")).not.toContain(".fetch");
    expect((await read("_useClient.ts")).match(/(?<=import "\.\/)[^"]+(?=";)/g)).toEqual([
      "_base.fetch",
      "item.fetch",
      "audit.fetch",
      "demo.fetch",
      "ping.fetch",
    ]);
    expect(await read("_st.ts")).toContain('import { RootStore as stock } from "@libs/stock/lib/__client/_st";');
    for (const whole of ["useClient.ts", "st.ts", "usePage.ts"])
      expect(await Bun.file(path.join(root, "apps/shop/lib", whole)).text()).not.toContain("__client");

    await rm(path.join(root, "apps/shop/lib/_ping"), { recursive: true });
    await writeText(path.join(appPieces, "stale.st.ts"), "export {};\n");
    await app.scan({ refresh: true });
    expect((await readdir(appPieces)).sort()).toEqual([...scopePieces, ...modulePieces]);
    expect(await read("_useClient.ts")).not.toContain("ping");
  }, 120_000);

  test("load one module's store piece with only that module's store and descriptors, lib modules included", async () => {
    const { root } = await writeShopWorkspace("mall", "depot");
    expect(await evaluate(root, lonePieceScript("mall", "depot", "demo"), "mall")).toEqual({
      stores: ["demo"],
      actions: ["pickLabel"],
      state: ["label"],
      appSignal: ["demo"],
      libSignal: [],
    });
    expect(await evaluate(root, keptByWholeScript("mall"), "mall")).toEqual({ samePickLabel: true, label: "picked" });
    await pointScopes(root, ["apps/mall", "libs/depot"], { "useClient.ts": "./usePage" });
    expect(await evaluate(root, lonePieceScript("mall", "depot", "item"), "mall")).toEqual({
      stores: ["item"],
      actions: ["loadItemNote", "refreshItemCount"],
      state: ["noteDraft", "itemCount"],
      appSignal: ["item"],
      libSignal: ["item"],
    });
  }, 120_000);

  test("load the framework's own descriptors beside the page runtime without the app's constants", async () => {
    const { root } = await writeShopWorkspace("kiosk", "shelf");
    expect(await evaluate(root, basePieceScript("kiosk"), "kiosk")).toEqual({
      signal: ["base", "agent"],
      ping: "function",
      constants: [],
    });
  }, 120_000);

  test("let an app store file imported on its own keep the actions of the lib store it extends", async () => {
    const { root } = await writeShopWorkspace("plaza", "cargo");
    expect(await evaluate(root, appStoreAloneScript("plaza"), "plaza")).toEqual({
      actions: ["refreshItemCount", "loadItemNote"],
    });
  }, 120_000);

  test("load the upload module's descriptors before a store whose model holds a file, so its piece alone has the upload action", async () => {
    const { root } = await writeWorkspace({
      app: "studio",
      lib: "locker",
      libFiles: uploadFilesOf(),
      appFiles: shopFilesOf("locker"),
    });
    const piece = await Bun.file(path.join(root, "libs/locker/lib/__client/user.st.ts")).text();
    expect(piece.trimStart().startsWith('import "./file.fetch";\nimport "./user.fetch";\n')).toBe(true);
    expect(await Bun.file(path.join(root, "libs/locker/lib/__client/item.st.ts")).text()).not.toContain("file.fetch");
    await pointScopes(root, ["apps/studio", "libs/locker"], { "useClient.ts": "./usePage" });
    expect(await evaluate(root, uploadSetterScript("locker"), "studio")).toEqual({
      upload: "function",
      signal: ["file", "user"],
    });
  }, 120_000);

  test("say which sync to run again when a scope's modules cannot be read, since its store files then load no upload descriptors first", async () => {
    const warnings: string[] = [];
    const warn = spyOn(Logger.prototype, "warn").mockImplementation((message: string) => {
      warnings.push(message);
    });
    const readScopes = spyOn(RuntimeNameTable, "readScopes").mockRejectedValue(
      new Error("user.constant.ts is unreadable"),
    );
    try {
      const { root } = await writeWorkspace({
        app: "depot",
        lib: "hangar",
        libFiles: uploadFilesOf(),
        appFiles: shopFilesOf("hangar"),
      });
      expect(await Bun.file(path.join(root, "libs/hangar/lib/__client/user.st.ts")).text()).not.toContain("file.fetch");
    } finally {
      readScopes.mockRestore();
      warn.mockRestore();
    }
    const said = warnings.filter((message) => message.includes("[client-runtime]"));
    expect(said.find((message) => message.includes("libs/hangar/lib/__client"))).toContain(
      "(user.constant.ts is unreadable)",
    );
    expect(said.find((message) => message.includes("libs/hangar/lib/__client"))).toContain("Run `akan sync hangar`");
    expect(said.some((message) => message.includes("Run `akan sync depot`"))).toBe(true);
  }, 120_000);

  test("give a client file exactly the pieces of the modules it names, each generated and each loading only its module", async () => {
    const { root } = await writeShopWorkspace("outlet", "pallet");
    const runtime = await RouteRuntime.read(root, "apps/outlet");
    if (!runtime) throw new Error("the fixture app has no assembled runtime pieces");
    const file = "apps/outlet/ui/Card.tsx";
    const text =
      'import { fetch, st } from "@apps/outlet/client";\nexport const Card = () => [st.use.label(), fetch.pingAt()];\n';
    const verdict = RuntimeUse.analyze({ fileName: file, text }, runtime.table);
    const result = runtime.transform(text, path.join(root, file));

    expect(
      verdict.resolvable ? new Set(verdict.owners.map(({ module, needs }) => `${module} ${needs}`)) : null,
    ).toEqual(new Set(["demo store", "ping descriptor"]));
    expect(result?.pieces).toEqual([
      "apps/outlet/lib/__client/demo.fetch",
      "apps/outlet/lib/__client/ping.fetch",
      "apps/outlet/lib/__client/demo.st",
    ]);
    await pointScopes(root, ["apps/outlet", "libs/pallet"], { "useClient.ts": "./usePage" });
    expect(await evaluate(root, routeRuntimeScript("outlet", result?.pieces ?? []), "outlet")).toEqual({
      stores: ["demo"],
      signal: ["demo", "ping"],
    });
  }, 120_000);

  test("bundle for a browser with each named module's descriptors once, no other module's and nothing its signal runs on the server", async () => {
    const files: Record<string, string> = shopFilesOf("trolley");
    const pingSignal = "lib/_ping/ping.signal.ts";
    const { root } = await writeWorkspace({
      app: "stall",
      lib: "trolley",
      libFiles: stockFiles,
      appFiles: {
        ...files,
        [pingSignal]: `${files[pingSignal]}`.replace('.exec(() => "")', '.exec(() => "ran-on-the-server")'),
        "ui/Card.tsx":
          'import { fetch, st } from "@apps/stall/client";\nexport const Card = () => [st.use.label(), fetch.pingAt()];\n',
        "ui/Tile.tsx": 'import { fetch } from "@apps/stall/client";\nexport const Tile = () => fetch.pingAt();\n',
      },
    });
    const runtime = await RouteRuntime.read(root, "apps/stall");
    if (!runtime) throw new Error("the fixture app has no assembled runtime pieces");
    const built = await Bun.build({
      entrypoints: ["Card", "Tile"].map((name) => path.join(root, `apps/stall/ui/${name}.tsx`)),
      target: "browser",
      splitting: true,
      define: { "process.env.AKAN_PUBLIC_APP_NAME": '"stall"' },
      plugins: [
        {
          name: "route-runtime",
          setup(build) {
            build.onLoad({ filter: /^(?!.*[\\/]node_modules[\\/]).*\.tsx?$/ }, async ({ path: file }) => {
              const loader = file.endsWith("x") ? "tsx" : "ts";
              const redirected = runtime.redirectOf(file);
              if (redirected) return { contents: redirected, loader };
              const source = await Bun.file(file).text();
              return { contents: runtime.transform(source, file)?.source ?? source, loader };
            });
          },
        },
      ],
    });
    const bundled = (await Promise.all(built.outputs.map((output) => output.text()))).join("\n");
    const descriptorsOf = (endpoint: string) =>
      bundled.match(new RegExp(`\\b${endpoint}: \\{\\s+type: "`, "g"))?.length ?? 0;

    expect(built.outputs.length).toBeGreaterThan(2);
    expect(descriptorsOf("pingAt")).toBe(1);
    expect(["auditTrail", "itemCount"].map(descriptorsOf)).toEqual([0, 0]);
    expect(bundled).not.toContain("ran-on-the-server");
  }, 120_000);

  test("assemble the same store, fetch and signal keys as the whole client runtime, in a browser and outside one", async () => {
    const { root } = await writeShopWorkspace("arcade", "vault");
    const evaluateBoth = async () => ({
      node: await evaluate(root, runtimeKeysScript("arcade"), "arcade"),
      browser: await evaluate(root, runtimeKeysScript("arcade", { browser: true }), "arcade"),
    });
    const sorted = (keys: Record<string, Record<string, unknown>>) =>
      Object.fromEntries(
        Object.entries(keys).map(([env, byKey]) => [
          env,
          Object.fromEntries(Object.entries(byKey).map(([key, value]) => [key, [...(value as string[])].sort()])),
        ]),
      );
    const whole = await evaluateBoth();
    await pointScopes(root, ["apps/arcade", "libs/vault"], {
      "useClient.ts": "./__client/_useClient",
      "st.ts": "./__client/_st",
    });
    expect(sorted(await evaluateBoth())).toEqual(sorted(whole));
  }, 120_000);
});

const redeclaringLibStore = `import { store } from "akanjs/store";

import { sig } from "../useClient";

export class ItemStore extends store(sig.item, () => ({ itemCount: 1, tally: 0, winner: "" })) {
  static side = "lib";
  markWinner() {
    this.set({ winner: "lib" });
  }
}
`;
const redeclaringAppStore = `import { store } from "akanjs/store";

import { item } from "../__lib/lib.store";
import { sig } from "../useClient";

export class ItemStore extends store(sig.item, () => ({ itemCount: 10, noteDraft: "" }), ...item.stores) {
  static side = "app";
  markWinner() {
    this.set({ winner: "app" });
  }
  setTally(tally: number) {
    this.set({ tally: tally * 2 });
  }
}
`;
const redeclaredScript = (files: string[]) => `
const { st } = await import("akanjs/store");
${files.map((file) => `await import("./${file}.ts");`).join("\n")}
const itemCount = st.get().itemCount;
await st.do.markWinner();
await st.do.setTally(3);
const { instance, store } = globalThis[Symbol.for("akanjs.store.registry")];
console.log(JSON.stringify({
  default: itemCount,
  action: st.get().winner,
  setter: st.get().tally,
  generatedSetter: instance.generatedSetters.has("setTally"),
  registered: store.get("item").side,
}));
`;
const keptValueScript = (pieces: string[], wholes: string[], itemCount: number) => `
const { st } = await import("akanjs/store");
${pieces.map((file) => `await import("./${file}.ts");`).join("\n")}
await st.do.setItemCount(${itemCount});
await st.do.setNoteDraft("typed");
await st.do.setTally(4);
${wholes.map((file) => `await import("./${file}.ts");`).join("\n")}
const { itemCount, noteDraft, tally } = st.get();
console.log(JSON.stringify({ itemCount, noteDraft, tally }));
`;

describe("an app store that redeclares what the lib store it extends declares", () => {
  test("answers under every load order of its pieces what the whole runtime answers: the lib's default, its own action and its own declared setter", async () => {
    const [app, lib] = ["grocer", "silo"];
    const { root } = await writeWorkspace({
      app,
      lib,
      libFiles: { ...stockFiles, "lib/item/item.store.ts": redeclaringLibStore },
      appFiles: { ...shopFilesOf(lib), "lib/item/item.store.ts": redeclaringAppStore },
    });
    const answer = (files: string[]) => evaluate(root, redeclaredScript(files), app);
    const [appPiece, libPiece] = [`apps/${app}/lib/__client/item.st`, `libs/${lib}/lib/__client/item.st`];
    const [appWhole, libWhole] = [`apps/${app}/lib/__client/_st`, `libs/${lib}/lib/__client/_st`];

    const whole = await answer([`apps/${app}/lib/st`]);
    expect(whole).toEqual({ default: 1, action: "app", setter: 6, generatedSetter: true, registered: "app" });
    await pointScopes(root, [`apps/${app}`, `libs/${lib}`], { "useClient.ts": "./usePage" });
    for (const order of [[libPiece, appPiece], [appPiece, libPiece], [appPiece, libWhole, appWhole], [appWhole]])
      expect({ order, answer: await answer(order) }).toEqual({ order, answer: whole });
  }, 120_000);

  test("keeps a value set by hand when the whole runtime loads after its pieces, whichever declared default the value equals", async () => {
    const [app, lib] = ["baker", "larder"];
    const { root } = await writeWorkspace({
      app,
      lib,
      libFiles: { ...stockFiles, "lib/item/item.store.ts": redeclaringLibStore },
      appFiles: { ...shopFilesOf(lib), "lib/item/item.store.ts": redeclaringAppStore },
    });
    await pointScopes(root, [`apps/${app}`, `libs/${lib}`], { "useClient.ts": "./usePage" });
    const pieces = [`libs/${lib}/lib/__client/item.st`, `apps/${app}/lib/__client/item.st`];
    const wholes = [`libs/${lib}/lib/__client/_st`, `apps/${app}/lib/__client/_st`];
    for (const itemCount of [1, 10, 5])
      expect(await evaluate(root, keptValueScript(pieces, wholes, itemCount), app)).toEqual({
        itemCount,
        noteDraft: "typed",
        tally: 8,
      });
  }, 120_000);
});

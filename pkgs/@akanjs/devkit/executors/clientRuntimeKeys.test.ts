import { describe, expect, test } from "bun:test";
import { mkdir, readdir, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTempApp, tempRoots, writeJson, writeText } from "../test/testHelpers";

const trackRoot = tempRoots();
const akanjsRoot = path.resolve(import.meta.dir, "../../../akanjs");
const recordedPath = path.join(import.meta.dir, "clientRuntimeKeys.fixture.json");
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
  ...Object.fromEntries(
    Object.entries(kitFiles)
      .filter(([file]) => file.startsWith("lib/item/"))
      .map(([file, content]) => [
        file.replaceAll("item", "page"),
        content.replaceAll("item", "page").replaceAll("Item", "Page"),
      ]),
  ),
  "lib/page/Page.Unit.tsx": "export const Card = () => null;\n",
};

const clientBarrelScript = `
const { Page, st, usePage } = await import("./apps/site/client.ts");
console.log(JSON.stringify({ unit: typeof Page.Unit.Card, store: typeof st.do.refreshPageCount, usePage: typeof usePage }));
`;

const writeWorkspace = async ({ app = "demo", lib = "kit", libFiles = kitFiles, appFiles = demoFiles } = {}) => {
  const temp = trackRoot(await createTempApp(app, await realpath(os.tmpdir())));
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
    const { root } = await writeWorkspace();
    const keys = await evaluate(root, keysScript);
    if (process.env.AKAN_RECORD_CLIENT_RUNTIME_KEYS === "1")
      await Bun.write(recordedPath, `${JSON.stringify(keys, null, 2)}\n`);
    expect(keys, howToRecord).toEqual(await Bun.file(recordedPath).json());
    expect(await evaluate(root, browserScript)).toEqual({
      appIsTab: true,
      libIsTab: true,
      "fetch.slice": ["item", "itemInPublic", "itemWithNote"],
    });
  }, 120_000);

  test("loads from the client barrel when a database module is named page, its UI and store included", async () => {
    const loaded = await evaluate(await writePageWorkspace(), clientBarrelScript, "site");
    expect(loaded).toEqual({ unit: "function", store: "function", usePage: "function" });
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

const lonePieceScript = (app: string) => `
const { StoreRegistry, st } = await import("akanjs/store");
const storesBefore = new Set(StoreRegistry.stores.keys());
await import("./apps/${app}/lib/__client/demo.st.ts");
const { fetch } = await import("./apps/${app}/lib/usePage.ts");
const newStores = () => [...StoreRegistry.stores.keys()].filter((key) => !storesBefore.has(key)).sort();
const actionsOf = () => ["pickLabel", "loadItemNote", "refreshItemCount"].filter((key) => key in st.do);
const lone = { stores: newStores(), signal: Object.keys(fetch.ownSerializedSignal), actions: actionsOf() };
const pickLabel = st.do.pickLabel;
await pickLabel("picked");
await import("./apps/${app}/lib/st.ts");
console.log(JSON.stringify({
  lone,
  whole: {
    stores: newStores(),
    signal: Object.keys(fetch.ownSerializedSignal).filter((key) => key !== "demo"),
    actions: actionsOf(),
    samePickLabel: st.do.pickLabel === pickLabel,
    label: st.get().label,
  },
}));
`;

const wholeSignalOrderScript = (app: string) => `
const { fetch } = await import("./apps/${app}/lib/sig.ts");
console.log(JSON.stringify(Object.keys(fetch.ownSerializedSignal)));
`;

const browserOrderScript = (app: string) => `
Object.assign(globalThis, { window: globalThis, location: new URL("http://localhost:4200/") });
const { FetchClient } = await import("akanjs/fetch");
await import("./apps/${app}/lib/useClient.ts");
await import("./apps/${app}/lib/st.ts");
console.log(JSON.stringify(Object.keys(FetchClient.build({}, {}).fetch.ownSerializedSignal)));
`;

//? A workspace per test: the temp root goes after each test, and the scan caches an app or lib by name.
describe("an app's client runtime pieces", () => {
  test("give each module a fetch piece for its signal and a store piece for its store, and leave with the module", async () => {
    const { root, app } = await writeShopWorkspace("shop", "stock");
    const appPieces = path.join(root, "apps/shop/lib/__client");
    const read = (file: string) => Bun.file(path.join(appPieces, file)).text();
    const modulePieces = ["demo.fetch.ts", "demo.st.ts", "item.fetch.ts", "item.st.ts", "note.st.ts"];
    expect((await readdir(appPieces)).sort()).toEqual(["_base.fetch.ts", ...modulePieces, "ping.fetch.ts"]);
    expect((await readdir(path.join(root, "libs/stock/lib/__client"))).sort()).toEqual([
      "_base.fetch.ts",
      "audit.fetch.ts",
      "item.fetch.ts",
      "item.st.ts",
    ]);
    expect(await read("_base.fetch.ts")).toContain('import "@libs/stock/lib/useClient";');
    expect(await read("_base.fetch.ts")).toContain('getSerializedSignalOf("stock")');
    expect(await read("ping.fetch.ts")).toContain('getSerializedSignalOf("ping")');
    expect(await read("demo.st.ts")).toContain('import "./demo.fetch";');
    expect(await read("demo.st.ts")).toContain('import { DemoStore } from "../_demo/demo.store";');
    expect(await read("item.st.ts")).toContain('import { ItemStore } from "../item/item.store";');
    expect(await read("note.st.ts")).not.toContain(".fetch");

    await rm(path.join(root, "apps/shop/lib/_ping"), { recursive: true });
    await writeText(path.join(appPieces, "stale.st.ts"), "export {};\n");
    await app.scan({ refresh: true });
    expect((await readdir(appPieces)).sort()).toEqual(["_base.fetch.ts", ...modulePieces]);
    expect(await Bun.file(path.join(root, "apps/shop/lib/useClient.ts")).text()).not.toContain("ping");
  }, 120_000);

  test("load one module's store piece alone with only its store and descriptors, which the whole store then keeps", async () => {
    const { root } = await writeShopWorkspace("mall", "depot");
    expect(await evaluate(root, lonePieceScript("mall"), "mall")).toEqual({
      lone: { stores: ["demo"], signal: ["demo"], actions: ["pickLabel"] },
      whole: {
        stores: ["demo", "item", "note"],
        signal: ["base", "agent", "audit", "item", "ping"],
        actions: ["pickLabel", "loadItemNote", "refreshItemCount"],
        samePickLabel: true,
        label: "picked",
      },
    });
  }, 120_000);

  test("apply the descriptors in the order of the whole signal, in a browser that loads the app's before its lib's", async () => {
    const { root } = await writeShopWorkspace("arcade", "vault");
    const whole = await evaluate(root, wholeSignalOrderScript("arcade"), "arcade");
    expect(await evaluate(root, browserOrderScript("arcade"), "arcade")).toEqual(whole);
  }, 120_000);
});

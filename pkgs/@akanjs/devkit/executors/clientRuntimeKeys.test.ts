import { describe, expect, test } from "bun:test";
import { mkdir, realpath, symlink } from "node:fs/promises";
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

const writeWorkspace = async () => {
  const temp = trackRoot(await createTempApp("demo", await realpath(os.tmpdir())));
  const { root } = temp;
  const kitDir = path.join(root, "libs/kit");
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  await symlink(akanjsRoot, path.join(root, "node_modules/akanjs"));
  await writeJson(path.join(root, "tsconfig.json"), {
    compilerOptions: { target: "ESNext", paths: { "@apps/*": ["./apps/*"], "@libs/*": ["./libs/*"] } },
    references: [],
  });
  for (const dir of [path.join(root, "apps/demo"), kitDir])
    await writeJson(path.join(dir, "tsconfig.json"), { extends: "../../tsconfig.json" });
  await writeJson(path.join(kitDir, "package.json"), { type: "module", name: "@kit", version: "0.0.1" });
  await writeText(path.join(kitDir, "akan.config.ts"), "export default {};\n");
  await writeText(path.join(kitDir, "lib/__scalar/.keep"), "");
  for (const [file, content] of Object.entries(kitFiles)) await writeText(path.join(kitDir, file), content);
  for (const [file, content] of Object.entries(demoFiles)) await writeText(path.join(root, "apps/demo", file), content);
  await temp.app.scan();
  return root;
};

const keysOf = async (root: string) => {
  const proc = Bun.spawn([process.execPath, "-e", keysScript], {
    cwd: root,
    env: {
      ...process.env,
      AKAN_PUBLIC_APP_NAME: "demo",
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
  return JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}") as Record<string, string[]>;
};

describe("an app's whole client runtime", () => {
  test("answers the same store, fetch and signal keys as recorded, lib model and service store included", async () => {
    const keys = await keysOf(await writeWorkspace());
    if (process.env.AKAN_RECORD_CLIENT_RUNTIME_KEYS === "1")
      await Bun.write(recordedPath, `${JSON.stringify(keys, null, 2)}\n`);
    expect(keys, howToRecord).toEqual(await Bun.file(recordedPath).json());
  }, 120_000);
});

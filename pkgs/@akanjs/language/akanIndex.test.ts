import { describe, expect, it } from "bun:test";
import ts from "typescript";
import { AkanIndex } from "./akanIndex";

const root = "/ws";
const files: Record<string, string> = {
  "apps/demo/lib/memo/memo.constant.ts": `import { via } from "akanjs/constant";
export class MemoInput extends via((field) => ({
  name: field(String),
  count: field(Number),
})) {}
export class MemoObject extends via(MemoInput, (field) => ({
  imageUrl: field(String),
})) {}
export class LightMemo extends via(MemoObject, ["name"] as const, (resolve) => ({})) {}
export class Memo extends via(MemoObject, LightMemo, (resolve) => ({})) {}
`,
  "apps/demo/lib/memo/memo.document.ts": `import { by, from, into } from "akanjs/document";
import * as cnst from "../cnst";
export class MemoFilter extends from(cnst.Memo, (filter) => ({
  query: {
    byName: filter().arg("name", String).query((name) => ({ name })),
  },
  sort: {},
})) {}
export class Memo extends by(cnst.Memo) {}
export class MemoModel extends into(Memo, MemoFilter, cnst.memo, () => ({})) {}
`,
  "apps/demo/lib/memo/memo.service.ts": `import { serve } from "akanjs/service";
import * as db from "../db";
export class MemoService extends serve(db.memo, () => ({})) {
  async rename(id: string) {
    const memo = await this.getMemo(id);
    return await this.listByName(memo.name);
  }
}
`,
  "apps/demo/lib/memo/memo.signal.ts": `import { endpoint, slice } from "akanjs/signal";
import * as srv from "../srv";
export class MemoSlice extends slice(srv.memo, { guards: { root: Admin, get: Public } }, (init) => ({
  inPublic: init({ guards: [Public] })
    .search("name", String)
    .live()
    .exec(function (name) {
      return this.memoService.queryByName(name);
    }),
})) {}
export class MemoEndpoint extends endpoint(srv.memo.with(srv.util), ({ pubsub, message, query }) => ({
  memoChanged: pubsub(cnst.Memo, { guards: [Public] }).room("memoId", ID).exec(function () {}),
  ping: message(String, { guards: [Public] }).msg("text", String).exec(function () {}),
  count: query(Number, { guards: [Public] }).exec(function () {}),
})) {}
`,
  "apps/demo/lib/memo/memo.store.ts": `import { store } from "akanjs/store";
import { fetch, sig } from "../useClient";
export class MemoStore extends store(sig.memo, () => ({
  memoDraftOpen: false,
})) {
  async save() {
    this.setMemo(await fetch.createMemo(this.get().memoForm));
    this.setMemoDraftOpen(true);
  }
}
`,
  "apps/demo/page/memo.tsx": `import { fetch, st, sig, srv } from "@apps/demo/client";
export default async function Page() {
  const { memoListInPublic } = await fetch.initMemoInPublic();
  const memo = memoListInPublic[0];
  const { memoView } = use(fetch.viewMemo(memo.id));
  st.do.setNameOnMemo("x");
  st.do.setImageUrlOnMemo("y");
  fetch.subscribeMemoChanged(memo.id, () => {});
  fetch.listenPing(() => {});
  fetch.slice.memo;
  fetch.slice.memoInPublic;
  sig.memo;
  return st.use.memoForm();
}
`,
  "apps/other/lib/memo/memo.signal.ts": `import { slice } from "akanjs/signal";
import * as srv from "../srv";
export class MemoSlice extends slice(srv.memo, {}, (init) => ({
  inPublic: init({ guards: [Public] }).exec(function () {}),
})) {}
`,
  "apps/other/lib/memo/memo.service.ts": `import { serve } from "akanjs/service";
import * as db from "../db";
export class MemoService extends serve(db.memo, () => ({})) {}
`,
};

const indexOf = () => {
  const index = new AkanIndex({ ts, root });
  for (const [rel, text] of Object.entries(files)) index.setFile(`${root}/${rel}`, text);
  return index;
};

const at = (rel: string, needle: string, nth = 0) => {
  const text = files[rel];
  let offset = -1;
  for (let i = 0; i <= nth; i++) offset = text.indexOf(needle, offset + 1);
  if (offset < 0) throw new Error(`${needle} not in ${rel}`);
  return {
    fileName: `${root}/${rel}`,
    text,
    offset: offset + Math.max(needle.lastIndexOf("."), needle.lastIndexOf(" "), needle.lastIndexOf("(")) + 1,
  };
};

const where = (index: AkanIndex, rel: string, needle: string, nth = 0) => {
  const { fileName, text, offset } = at(rel, needle, nth);
  return index
    .definitionAt(fileName, text, offset)
    .map((target) => `${target.span.fileName.slice(root.length + 1)}:${target.span.line + 1}`);
};

const page = "apps/demo/page/memo.tsx";

describe("AkanIndex definitions", () => {
  const index = indexOf();

  it("sends a named slice's derived names to the slice key", () => {
    expect(where(index, page, "fetch.initMemoInPublic")).toEqual(["apps/demo/lib/memo/memo.signal.ts:4"]);
    expect(where(index, page, "{ memoListInPublic")).toEqual(["apps/demo/lib/memo/memo.signal.ts:4"]);
    expect(where(index, page, "fetch.slice.memoInPublic")).toEqual(["apps/demo/lib/memo/memo.signal.ts:4"]);
  });

  it("sends the default slice and module refs to their classes only behind their receivers", () => {
    expect(where(index, page, "fetch.slice.memo;")).toEqual(["apps/demo/lib/memo/memo.signal.ts:3"]);
    expect(where(index, page, "sig.memo")).toEqual(["apps/demo/lib/memo/memo.signal.ts:3"]);
    expect(where(index, page, "memoListInPublic[0]")).toEqual([]);
    expect(where(index, page, "viewMemo(memo")).toEqual([]);
  });

  it("sends CRUD, state and view names to the constant model", () => {
    expect(where(index, page, "fetch.viewMemo")).toEqual(["apps/demo/lib/memo/memo.constant.ts:10"]);
    expect(where(index, page, "{ memoView")).toEqual(["apps/demo/lib/memo/memo.constant.ts:10"]);
    expect(where(index, page, "st.use.memoForm")).toEqual(["apps/demo/lib/memo/memo.constant.ts:10"]);
    expect(where(index, "apps/demo/lib/memo/memo.store.ts", "this.setMemo")).toEqual([
      "apps/demo/lib/memo/memo.constant.ts:10",
    ]);
  });

  it("follows the via chain to the class that declares a form setter's field", () => {
    expect(where(index, page, "st.do.setNameOnMemo")).toEqual(["apps/demo/lib/memo/memo.constant.ts:3"]);
    expect(where(index, page, "st.do.setImageUrlOnMemo")).toEqual(["apps/demo/lib/memo/memo.constant.ts:7"]);
  });

  it("reads the model from the receiver for query and CRUD names", () => {
    const service = "apps/demo/lib/memo/memo.service.ts";
    expect(where(index, service, "this.getMemo")).toEqual(["apps/demo/lib/memo/memo.constant.ts:10"]);
    expect(where(index, service, "this.listByName")).toEqual(["apps/demo/lib/memo/memo.document.ts:5"]);
    const signal = "apps/demo/lib/memo/memo.signal.ts";
    expect(where(index, signal, "this.memoService")).toEqual(["apps/demo/lib/memo/memo.service.ts:3"]);
    expect(where(index, signal, "this.memoService.queryByName")).toEqual(["apps/demo/lib/memo/memo.document.ts:5"]);
  });

  it("maps pubsub and message endpoints to subscribe/listen and leaves a query to TypeScript", () => {
    expect(where(index, page, "fetch.subscribeMemoChanged")).toEqual(["apps/demo/lib/memo/memo.signal.ts:12"]);
    expect(where(index, page, "fetch.listenPing")).toEqual(["apps/demo/lib/memo/memo.signal.ts:13"]);
  });

  it("sends a store state setter to the state key", () => {
    expect(where(index, "apps/demo/lib/memo/memo.store.ts", "this.setMemoDraftOpen")).toEqual([
      "apps/demo/lib/memo/memo.store.ts:4",
    ]);
  });

  it("never answers from another app", () => {
    const other = "apps/other/lib/memo/memo.signal.ts";
    expect(where(index, page, "fetch.initMemoInPublic").some((hit) => hit.startsWith("apps/other"))).toBe(false);
    expect(where(index, other, "srv.memo")).toEqual(["apps/other/lib/memo/memo.service.ts:3"]);
  });

  it("describes a slice in hover", () => {
    const { fileName, text, offset } = at(page, "fetch.initMemoInPublic");
    const hover = index.hoverAt(fileName, text, offset);
    expect(hover?.targets[0]).toMatchObject({
      family: "slice",
      label: "slice inPublic",
      detail: ["guards: Public", "live"],
    });
  });
});

describe("AkanIndex references and source keys", () => {
  const index = indexOf();
  const readText = (fileName: string) => files[fileName.slice(root.length + 1)];

  it("finds every derived use of a slice key", () => {
    const { fileName, offset } = at("apps/demo/lib/memo/memo.signal.ts", "inPublic:");
    const uses = index
      .referencesAt(fileName, offset, readText)
      .map((span) => `${span.fileName.slice(root.length + 1)}:${span.line + 1}`);
    expect(uses).toEqual([page.concat(":3"), page.concat(":3"), page.concat(":11")]);
  });

  it("finds form setter uses from the field that declares it", () => {
    const { fileName, offset } = at("apps/demo/lib/memo/memo.constant.ts", "name:");
    expect(index.referencesAt(fileName, offset, readText).map((span) => span.line + 1)).toEqual([6]);
  });

  it("searches a quoted source key as literal text", () => {
    const local = indexOf();
    const rel = "apps/demo/lib/memo/memo.document.ts";
    const text = files[rel].replace("byName:", `"by(Name":`);
    local.setFile(`${root}/${rel}`, text);
    const offset = text.indexOf(`"by(Name"`) + 1;
    expect(local.sourceKeyAt(`${root}/${rel}`, offset)?.sourceKey).toBe("by(Name");
    expect(local.referencesAt(`${root}/${rel}`, offset, () => text)).toEqual([]);
  });

  it("lists lens keys for slices, queries, fields, state and socket endpoints", () => {
    const keys = (rel: string) => index.sourceKeysOf(`${root}/${rel}`).map((key) => key.sourceKey);
    expect(keys("apps/demo/lib/memo/memo.signal.ts")).toEqual(["MemoSlice", "inPublic", "memoChanged", "ping"]);
    expect(keys("apps/demo/lib/memo/memo.document.ts")).toEqual(["MemoFilter", "byName"]);
    expect(keys("apps/demo/lib/memo/memo.constant.ts")).toEqual(["name", "count", "imageUrl"]);
    expect(keys("apps/demo/lib/memo/memo.store.ts")).toEqual(["memoDraftOpen"]);
  });

  it("drops a removed file's contribution", () => {
    const local = indexOf();
    local.removeFile(`${root}/apps/demo/lib/memo/memo.signal.ts`);
    expect(where(local, page, "fetch.initMemoInPublic")).toEqual([]);
  });

  it("renames a slice key with every derived use in its own casing", () => {
    const { fileName, offset } = at("apps/demo/lib/memo/memo.signal.ts", "inPublic:");
    const edits = index.renameAt(fileName, offset, "inFeed", readText) ?? [];
    expect(edits.map((edit) => edit.newText)).toEqual(["inFeed", "memoListInFeed", "initMemoInFeed", "memoInFeed"]);
    expect(index.renameAt(fileName, offset, "not valid", readText)).toBeNull();
  });

  it("renames a query key and leaves fields to TypeScript", () => {
    const { fileName, offset } = at("apps/demo/lib/memo/memo.document.ts", "byName:");
    expect(index.renameAt(fileName, offset, "byTitle", readText)?.map((edit) => edit.newText)).toEqual([
      "byTitle",
      "listByTitle",
      "queryByTitle",
    ]);
    const field = at("apps/demo/lib/memo/memo.constant.ts", "name:");
    expect(index.renameTargetAt(field.fileName, field.offset)).toBeNull();
  });
});

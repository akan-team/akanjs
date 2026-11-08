import { describe, expect, it } from "bun:test";
import ts from "typescript";
import { AkanIndex } from "./akanIndex";

const root = "/ws";
const files: Record<string, string> = {
  "libs/shared/lib/file/file.constant.ts": `import { via } from "akanjs/constant";
export class FileInput extends via((field) => ({
  url: field(String),
})) {}
export class File extends via(FileInput, (resolve) => ({})) {}
`,
  "libs/shared/lib/file/file.service.ts": `import { serve } from "akanjs/service";
import * as db from "../db";
export class FileService extends serve(db.file, () => ({})) {}
`,
  "libs/shared/lib/__scalar/geo/geo.constant.ts": `import { via } from "akanjs/constant";
export class Geo extends via((field) => ({
  lat: field(Number),
})) {}
`,
  "apps/demo/lib/memo/memo.constant.ts": `import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";
import { File } from "../../../../libs/shared/lib/file/file.constant";
import { Geo } from "../../../../libs/shared/lib/__scalar/geo/geo.constant";
export class MemoStatus extends enumOf("memoStatus", ["draft", "shared"] as const) {}
export class MemoInput extends via((field) => ({
  name: field(String),
  images: field([File]),
  place: field(Geo).optional(),
})) {}
export class MemoObject extends via(MemoInput, (field) => ({
  status: field(MemoStatus, { default: "draft" }),
})) {}
export class Memo extends via(MemoObject, (resolve) => ({})) {}
`,
  "apps/demo/lib/memo/memo.document.ts": `import { by, from, into } from "akanjs/document";
import * as cnst from "../cnst";
export class MemoFilter extends from(cnst.Memo, (filter) => ({
  query: {
    byName: filter().arg("name", String).query((name) => ({ name })),
  },
  sort: {},
})) {}
export class MemoModel extends into(Memo, MemoFilter, cnst.memo, () => ({})) {}
`,
  "apps/demo/lib/memo/memo.service.ts": `import { serve } from "akanjs/service";
import * as db from "../db";
export class MemoService extends serve(db.memo, () => ({})) {
  async share(id: string) {
    const memo = await this.getMemo(id);
    return await this.touch(memo.id);
  }
  async touch(id: string) {
    return await this.listByName(id);
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
export class MemoEndpoint extends endpoint(srv.memo, ({ mutation }) => ({
  shareMemo: mutation(cnst.Memo, { guards: [Owner] }).exec(async function (id) {
    return await this.memoService.share(id);
  }),
})) {}
`,
  "apps/demo/lib/memo/memo.store.ts": `import { store } from "akanjs/store";
import { fetch, sig } from "../useClient";
export class MemoStore extends store(sig.memo, () => ({})) {
  async shareMemo(id: string) {
    this.setMemo(await fetch.shareMemo(id));
    await this.refreshAll();
  }
  async refreshAll() {}
}
`,
  "apps/demo/lib/memo/Memo.Util.tsx": `import { st } from "@apps/demo/client";
export const Share = ({ id }: { id: string }) => <button onClick={() => st.do.shareMemo(id)} />;
export const Rename = () => st.do.setNameOnMemo("x");
export const Plain = ({ option }: { option: { memoId: string } }) => option.memoId;
`,
  "apps/demo/page/memo.tsx": `import { fetch } from "@apps/demo/client";
export default async function Page() {
  const { memoInitInPublic } = await fetch.initMemoInPublic();
  return memoInitInPublic;
}
`,
};

const graphOf = () => {
  const index = new AkanIndex({ ts, root });
  for (const [rel, text] of Object.entries(files)) index.setFile(`${root}/${rel}`, text);
  return index.graph((fileName) => files[fileName.slice(root.length + 1)]);
};

const edgesOf = (graph: ReturnType<typeof graphOf>, kind?: string) =>
  graph.edges
    .filter((edge) => !kind || edge.kind === kind)
    .map((edge) => `${edge.from} -${edge.label ?? ""}-> ${edge.to}`)
    .sort();

describe("AkanIndex.graph", () => {
  it("draws a model's fields across its via chain and links each type it names", () => {
    const graph = graphOf();
    const memo = graph.nodes.find((node) => node.id === "model:apps/demo:memo");
    expect(
      memo?.fields?.map(({ name, type, array, optional, ref, declaredIn }) => [
        name,
        type,
        array,
        optional,
        ref,
        declaredIn,
      ]),
    ).toEqual([
      ["name", "String", false, false, null, "MemoInput"],
      ["images", "File", true, false, "model:libs/shared:file", "MemoInput"],
      ["place", "Geo", false, true, "scalar:libs/shared:geo", "MemoInput"],
      ["status", "MemoStatus", false, false, "enum:apps/demo:MemoStatus", "MemoObject"],
    ]);
    expect(graph.nodes.find((node) => node.id === "enum:apps/demo:MemoStatus")?.values).toEqual(["draft", "shared"]);
    expect(edgesOf(graph, "field")).toEqual([
      "model:apps/demo:memo -images[]-> model:libs/shared:file",
      "model:apps/demo:memo -place-> scalar:libs/shared:geo",
      "model:apps/demo:memo -status-> enum:apps/demo:MemoStatus",
    ]);
    expect(memo?.at).toEqual({ file: "apps/demo/lib/memo/memo.constant.ts", line: 14, column: 14 });
  });

  it("follows a request from the page through the slice, guard and service to the query", () => {
    const graph = graphOf();
    expect(edgesOf(graph, "guard")).toEqual([
      "endpoint:apps/demo:memo.shareMemo --> guard:Owner",
      "slice:apps/demo:memo -get-> guard:Public",
      "slice:apps/demo:memo -root-> guard:Admin",
      "slice:apps/demo:memo.inPublic --> guard:Public",
    ]);
    expect(edgesOf(graph, "calls")).toEqual([
      "action:apps/demo:memo.shareMemo -refreshAll-> action:apps/demo:memo.refreshAll",
      "action:apps/demo:memo.shareMemo -setMemo-> model:apps/demo:memo",
      "endpoint:apps/demo:memo.shareMemo -share-> method:apps/demo:memo.share",
      "method:apps/demo:memo.share -getMemo-> model:apps/demo:memo",
      "method:apps/demo:memo.share -touch-> method:apps/demo:memo.touch",
      "method:apps/demo:memo.touch -listByName-> query:apps/demo:memo.byName",
      "slice:apps/demo:memo.inPublic -queryByName-> query:apps/demo:memo.byName",
    ]);
    expect(edgesOf(graph, "fetches")).toEqual([
      "action:apps/demo:memo.shareMemo -shareMemo-> endpoint:apps/demo:memo.shareMemo",
    ]);
  });

  it("names the component or page that uses a slice, an action or a form setter", () => {
    const graph = graphOf();
    expect(edgesOf(graph, "uses")).toEqual([
      "component:apps/demo/lib/memo/Memo.Util.tsx#Rename -setNameOnMemo-> model:apps/demo:memo",
      "component:apps/demo/lib/memo/Memo.Util.tsx#Share -shareMemo-> action:apps/demo:memo.shareMemo",
      "component:apps/demo/page/memo.tsx#default -initMemoInPublic-> slice:apps/demo:memo.inPublic",
    ]);
    const components = graph.nodes.filter((node) => node.kind === "component");
    expect(components.map(({ label, detail }) => [label, detail])).toEqual([
      ["Memo.Util.Rename", []],
      ["Memo.Util.Share", []],
      ["memo", ["page"]],
    ]);
  });

  it("links an app module that extends a lib module to the app's own node", () => {
    const index = new AkanIndex({ ts, root });
    const extended: Record<string, string> = {
      ...files,
      "libs/shared/lib/memo/memo.constant.ts": `import { via } from "akanjs/constant";
export class Memo extends via((field) => ({ title: field(String) })) {}
`,
      "libs/shared/lib/memo/memo.service.ts": `import { serve } from "akanjs/service";
import * as db from "../db";
export class MemoService extends serve(db.memo, () => ({})) {}
`,
    };
    for (const [rel, text] of Object.entries(extended)) index.setFile(`${root}/${rel}`, text);
    const graph = index.graph((fileName) => extended[fileName.slice(root.length + 1)]);
    expect(graph.nodes.some((node) => node.id === "model:libs/shared:memo")).toBe(true);
    expect(edgesOf(graph).filter((edge) => edge.includes("model:libs/shared:memo"))).toEqual([]);
  });

  it("draws the same graph whatever order the files were read in", () => {
    const withFolder: Record<string, string> = {
      ...files,
      "apps/demo/lib/folder/folder.signal.ts": `import { slice } from "akanjs/signal";
import * as srv from "../srv";
export class FolderSlice extends slice(srv.folder, { guards: { root: Admin, get: Public } }, (init) => ({})) {}
`,
    };
    const graphIn = (order: [string, string][]) => {
      const index = new AkanIndex({ ts, root });
      for (const [rel, text] of order) index.setFile(`${root}/${rel}`, text);
      return JSON.stringify(index.graph((fileName) => withFolder[fileName.slice(root.length + 1)]));
    };
    expect(graphIn(Object.entries(withFolder).reverse())).toBe(graphIn(Object.entries(withFolder)));
  });
});

import { describe, expect, it } from "bun:test";
import ts from "typescript";
import { AkanGraphDiff } from "./akanGraphDiff";
import { AkanIndex } from "./akanIndex";

const root = "/ws";
const constant = (fields: string) => `import { via } from "akanjs/constant";
import { Geo } from "../../../../libs/shared/lib/__scalar/geo/geo.constant";
export class MemoInput extends via((field) => ({
${fields}
})) {}
export class Memo extends via(MemoInput, (resolve) => ({})) {}
`;
const service = (methods: string) => `import { serve } from "akanjs/service";
import * as db from "../db";
export class MemoService extends serve(db.memo, () => ({})) {
${methods}
}
`;
const share = `  async share(id: string) {
    return await this.touch(id);
  }`;
const touch = (body: string) => `  async touch(id: string) {
    ${body}
  }`;
const signal = (keys: string) => `import { endpoint } from "akanjs/signal";
import * as srv from "../srv";
export class MemoEndpoint extends endpoint(srv.memo, ({ mutation }) => ({
${keys}
})) {}
`;
const shareMemo = `  shareMemo: mutation(cnst.Memo, { guards: [Owner] }).exec(async function (id) {
    return await this.memoService.share(id);
  }),`;

const base: Record<string, string> = {
  "libs/shared/lib/__scalar/geo/geo.constant.ts": `import { via } from "akanjs/constant";
export class Geo extends via((field) => ({ lat: field(Number) })) {}
`,
  "apps/demo/lib/memo/memo.constant.ts": constant("  name: field(String),\n  place: field(Geo),"),
  "apps/demo/lib/memo/memo.service.ts": service(`${share}\n${touch("return id;")}`),
  "apps/demo/lib/memo/memo.signal.ts": signal(shareMemo),
};
const head: Record<string, string> = {
  ...base,
  "apps/demo/lib/memo/memo.constant.ts": constant("  name: field(String).optional(),\n  pinned: field(Boolean),"),
  "apps/demo/lib/memo/memo.service.ts": service(
    `${touch("return await this.getMemo(id);")}\n${share}\n  async pin(id: string) {\n    return id;\n  }`,
  ),
  "apps/demo/lib/memo/memo.signal.ts": signal(`${shareMemo}
  pinMemo: mutation(cnst.Memo, { guards: [Owner] }).exec(async function (id) {
    return await this.memoService.pin(id);
  }),`),
};

const graphOf = (files: Record<string, string>) => {
  const index = new AkanIndex({ ts, root });
  for (const [rel, text] of Object.entries(files)) index.setFile(`${root}/${rel}`, text);
  return index.graph((fileName) => files[fileName.slice(root.length + 1)], { digests: true });
};

describe("AkanGraphDiff", () => {
  it("marks what a change added, removed and changed, down to a model's fields", () => {
    const changes = AkanGraphDiff.between(graphOf(base), graphOf(head));
    const changeOf = (id: string) => changes.nodes.find((node) => node.id === id)?.change ?? "unchanged";
    expect(changes.summary).toEqual({ added: 2, removed: 0, changed: 2 });
    expect(changeOf("method:apps/demo:memo.pin")).toBe("added");
    expect(changeOf("endpoint:apps/demo:memo.pinMemo")).toBe("added");
    expect(changeOf("method:apps/demo:memo.touch")).toBe("changed");
    expect(changeOf("model:apps/demo:memo")).toBe("changed");
    expect(
      changes.nodes
        .find((node) => node.id === "model:apps/demo:memo")
        ?.fields?.map(({ name, change }) => `${name} ${change ?? "unchanged"}`),
    ).toEqual(["name changed", "pinned added", "place removed"]);
    expect(
      changes.edges
        .filter((edge) => edge.change)
        .map((edge) => `${edge.change} ${edge.from} -${edge.label}-> ${edge.to}`),
    ).toEqual([
      "added endpoint:apps/demo:memo.pinMemo -null-> guard:Owner",
      "added method:apps/demo:memo.touch -getMemo-> model:apps/demo:memo",
      "added endpoint:apps/demo:memo.pinMemo -pin-> method:apps/demo:memo.pin",
      "removed model:apps/demo:memo -place-> scalar:libs/shared:geo",
    ]);
  });

  it("leaves a moved member unmarked and keeps it as context of the changed one it calls", () => {
    const changes = AkanGraphDiff.between(graphOf(base), graphOf(head));
    const shareNode = changes.nodes.find((node) => node.id === "method:apps/demo:memo.share");
    expect(shareNode?.change).toBeUndefined();
    expect(changes.nodes.some((node) => node.id === "endpoint:apps/demo:memo.shareMemo")).toBe(false);
    expect(changes.nodes.every((node) => node.digest === undefined)).toBe(true);
  });

  it("marks every node and field of a deleted module removed", () => {
    const changes = AkanGraphDiff.between(
      graphOf(head),
      graphOf({ "libs/shared/lib/__scalar/geo/geo.constant.ts": base["libs/shared/lib/__scalar/geo/geo.constant.ts"] }),
    );
    expect(changes.summary.removed).toBe(changes.nodes.filter((node) => node.change === "removed").length);
    expect(
      changes.nodes
        .find((node) => node.id === "model:apps/demo:memo")
        ?.fields?.every((field) => field.change === "removed"),
    ).toBe(true);
    expect(changes.edges.every((edge) => edge.change === "removed")).toBe(true);
  });
});

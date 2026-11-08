import { describe, expect, test } from "bun:test";
import type { AkanGraph, AkanGraphEdge, AkanGraphNode } from "akanjs/common";
import { StudioLayout } from "./studioLayout";

const at = (file: string, line = 1) => ({ file, line, column: 1 });
const node = (id: string, overrides: Partial<AkanGraphNode> = {}): AkanGraphNode => {
  const [kind, owner = "", scope = ""] = id.split(":");
  return {
    id,
    kind: kind as AkanGraphNode["kind"],
    name: scope,
    label: scope,
    owner: owner || null,
    module: scope.split(".")[0] || null,
    detail: [],
    at: at(`${owner}/lib/${scope}.ts`),
    ...overrides,
  };
};
const edge = (from: string, kind: AkanGraphEdge["kind"], to: string, label: string | null = null): AkanGraphEdge => ({
  from,
  to,
  kind,
  label,
  count: 1,
  at: null,
});

const graph: AkanGraph = {
  version: 1,
  nodes: [
    node("model:apps/demo:memo", {
      label: "Memo",
      fields: [
        {
          name: "image",
          type: "File",
          array: false,
          optional: false,
          ref: null,
          declaredIn: "MemoInput",
          at: at("m", 3),
        },
        {
          name: "images",
          type: "File",
          array: true,
          optional: false,
          ref: null,
          declaredIn: "MemoInput",
          at: at("m", 4),
        },
        {
          name: "status",
          type: "MemoStatus",
          array: false,
          optional: true,
          ref: null,
          declaredIn: "MemoInput",
          at: at("m", 5),
        },
      ],
    }),
    node("model:libs/shared:file", { label: "File", fields: [] }),
    node("enum:apps/demo:MemoStatus", { module: "memo", label: "MemoStatus", values: ["draft", "shared"] }),
    node("model:apps/demo:folder", { label: "Folder", fields: [] }),
    node("slice:apps/demo:memo.inPublic", { label: "memo.inPublic", detail: ["Public", "live"] }),
    node("endpoint:apps/demo:memo.shareMemo", { label: "memo.shareMemo", detail: ["mutation", "Owner"] }),
    node("method:apps/demo:memo.share", { label: "MemoService.share" }),
    node("method:apps/demo:memo.touch", { label: "MemoService.touch" }),
    node("action:apps/demo:memo.shareMemo", { label: "MemoStore.shareMemo" }),
    node("component:apps/demo/lib/memo/Memo.Util.tsx#Share", {
      owner: "apps/demo",
      module: "memo",
      label: "Memo.Util.Share",
    }),
    node("method:apps/demo:folder.open", { label: "FolderService.open" }),
    node("guard:Public", { owner: null, module: null }),
  ],
  edges: [
    edge("model:apps/demo:memo", "field", "model:libs/shared:file", "image"),
    edge("model:apps/demo:memo", "field", "model:libs/shared:file", "images[]"),
    edge("model:apps/demo:memo", "field", "enum:apps/demo:MemoStatus", "status"),
    edge("slice:apps/demo:memo.inPublic", "guard", "guard:Public"),
    edge("component:apps/demo/lib/memo/Memo.Util.tsx#Share", "uses", "action:apps/demo:memo.shareMemo", "shareMemo"),
    edge("action:apps/demo:memo.shareMemo", "fetches", "endpoint:apps/demo:memo.shareMemo", "shareMemo"),
    edge("endpoint:apps/demo:memo.shareMemo", "calls", "method:apps/demo:memo.share", "share"),
    edge("method:apps/demo:memo.share", "calls", "method:apps/demo:memo.touch", "touch"),
    edge("method:apps/demo:memo.touch", "calls", "model:apps/demo:memo", "getMemo"),
  ],
};

const boxesOf = (scene: ReturnType<typeof StudioLayout.erd>) =>
  Object.fromEntries(scene.boxes.map((box) => [box.node.id, box]));

describe("StudioLayout", () => {
  test("lists the modules the graph's nodes belong to", () => {
    expect(StudioLayout.modulesOf(graph)).toEqual(["file", "folder", "memo"]);
  });

  test("draws the ERD with each referenced type to the right of the model that names it", () => {
    const scene = StudioLayout.erd(graph, null);
    const boxes = boxesOf(scene);
    expect(Object.keys(boxes).sort()).toEqual([
      "enum:apps/demo:MemoStatus",
      "model:apps/demo:folder",
      "model:apps/demo:memo",
      "model:libs/shared:file",
    ]);
    expect(boxes["model:libs/shared:file"].x).toBeGreaterThan(boxes["model:apps/demo:memo"].x);
    expect(boxes["enum:apps/demo:MemoStatus"].x).toBeGreaterThan(boxes["model:apps/demo:memo"].x);
    expect(boxes["model:apps/demo:memo"].rows.map(({ text, hint }) => `${text}: ${hint}`)).toEqual([
      "image: File",
      "images: File[]",
      "status: MemoStatus?",
    ]);
    expect(boxes["enum:apps/demo:MemoStatus"].rows.map(({ text }) => text)).toEqual(["draft", "shared"]);
    const rowY = (text: string) => boxes["model:apps/demo:memo"].rows.find((row) => row.text === text)?.y;
    const starts = scene.links.map(({ edge, path }) => `${edge.label} ${Number(path.split(/[ ,C]/)[1])}`);
    expect(starts).toEqual([`image ${rowY("image")}`, `images[] ${rowY("images")}`, `status ${rowY("status")}`]);
  });

  test("scopes the ERD to a module's types and their direct relations", () => {
    expect(Object.keys(boxesOf(StudioLayout.erd(graph, "folder")))).toEqual(["model:apps/demo:folder"]);
    expect(Object.keys(boxesOf(StudioLayout.erd(graph, "file"))).sort()).toEqual([
      "model:apps/demo:memo",
      "model:libs/shared:file",
    ]);
  });

  test("lays a module's signals out from component to model, with guards as chips and no guard boxes", () => {
    const scene = StudioLayout.signals(graph, "memo");
    expect(scene.columns.map(({ label }) => label)).toEqual([
      "Components",
      "Store actions",
      "Endpoints & slices",
      "Service methods",
      "Queries & models",
    ]);
    const columnOf = (id: string) => scene.columns.findIndex(({ x }) => x === boxesOf(scene)[id]?.x);
    expect(columnOf("component:apps/demo/lib/memo/Memo.Util.tsx#Share")).toBe(0);
    expect(columnOf("action:apps/demo:memo.shareMemo")).toBe(1);
    expect(columnOf("slice:apps/demo:memo.inPublic")).toBe(2);
    expect(columnOf("method:apps/demo:memo.touch")).toBe(3);
    expect(columnOf("model:apps/demo:memo")).toBe(4);
    expect(boxesOf(scene)["slice:apps/demo:memo.inPublic"].rows.map(({ text }) => text)).toEqual(["Public · live"]);
    expect(scene.boxes.some((box) => box.node.kind === "guard")).toBe(false);
    expect(scene.boxes.some((box) => box.node.id === "method:apps/demo:folder.open")).toBe(false);
    const sameColumn = scene.links.find(({ edge }) => edge.label === "touch");
    const [x1, loop] = (sameColumn?.path.match(/^M(\d+),\d+ C(\d+),/) ?? []).slice(1).map(Number);
    expect(loop).toBeGreaterThan(x1);
  });

  test("wraps a column taller than the page into a second one beside it", () => {
    const many: AkanGraph = {
      version: 1,
      nodes: Array.from({ length: 80 }, (_, idx) => node(`model:apps/demo:m${idx}`, { label: `M${idx}`, fields: [] })),
      edges: [],
    };
    const xs = new Set(StudioLayout.erd(many, null).boxes.map((box) => box.x));
    expect(xs.size).toBeGreaterThan(1);
  });
});

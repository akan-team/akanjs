import { describe, expect, test } from "bun:test";
import type { AkanGraphNode } from "akanjs/common";
import { StudioActions } from "./studioActions";

const node = (id: string, patch: Partial<AkanGraphNode>): AkanGraphNode => ({
  id,
  kind: "model",
  name: "Memo",
  label: "Memo",
  owner: "apps/demo",
  module: "memo",
  detail: [],
  at: null,
  ...patch,
});

describe("StudioActions", () => {
  test("offers the workflows a node can start, aimed at its app and module", () => {
    expect(StudioActions.of(node("model:apps/demo:memo", {})).map(({ workflow, label }) => workflow ?? label)).toEqual([
      "Open module",
      "add-field",
      "add-enum-field",
      "add-mutation",
      "add-slice",
      "create-ui",
    ]);
    const [open, addField] = StudioActions.of(node("model:libs/shared:file", { owner: "libs/shared", module: "file" }));
    expect(open).toEqual({
      kind: "module",
      label: "Open module",
      inputs: { app: "shared", module: "file" },
      command: null,
    });
    expect(addField).toEqual({
      kind: "workflow",
      workflow: "add-field",
      label: "Add field",
      inputs: { app: "shared", module: "file" },
      command: "akan workflow plan add-field --app shared --module file --field <field> --type <type>",
    });
    expect(
      StudioActions.of(
        node("slice:apps/demo:memo.inPublic", { kind: "slice", name: "inPublic", label: "memo.inPublic" }),
      ).slice(1),
    ).toEqual([
      {
        kind: "workflow",
        workflow: "rename-key",
        label: "Rename slice key",
        inputs: { app: "demo", module: "memo", slice: "inPublic" },
        command: "akan workflow plan rename-key --app demo --module memo --slice inPublic --to <to>",
      },
    ]);
    expect(
      StudioActions.of(node("query:apps/demo:memo.byTitle", { kind: "query", name: "byTitle" }))[1].inputs,
    ).toEqual({
      app: "demo",
      module: "memo",
      query: "byTitle",
    });
  });

  test("offers only Open module for a node with no workflow, a scalar, a default slice or query, or an odd key", () => {
    const labelsOf = (patch: Partial<AkanGraphNode>) =>
      StudioActions.of(node(`${patch.kind}:apps/demo:x`, patch)).map(({ label }) => label);
    expect(labelsOf({ kind: "method", name: "list" })).toEqual(["Open module"]);
    expect(labelsOf({ kind: "scalar", owner: "libs/shared", module: "geo" })).toEqual(["Open module"]);
    expect(labelsOf({ kind: "slice", name: "" })).toEqual(["Open module"]);
    expect(labelsOf({ kind: "query", name: "" })).toEqual(["Open module"]);
    expect(labelsOf({ kind: "slice", name: "$(x)" })).toEqual(["Open module"]);
  });

  test("offers nothing for a removed node, an ownerless one, a module-less one or an odd app or module name", () => {
    expect(StudioActions.of(node("model:apps/demo:memo", { change: "removed" }))).toEqual([]);
    expect(StudioActions.of(node("model:memo", { owner: null }))).toEqual([]);
    expect(StudioActions.of(node("component:apps/demo:MemoCard", { kind: "component", module: null }))).toEqual([]);
    expect(StudioActions.of(node("enum:apps/demo:Kind", { kind: "enum", module: "__scalar" }))).toEqual([]);
    expect(StudioActions.of(node("model:apps/my app:memo", { owner: "apps/my app" }))).toEqual([]);
    expect(StudioActions.ofApp("my;app")).toEqual([]);
  });

  test("offers a new module for the app", () => {
    expect(StudioActions.ofApp("demo")).toEqual([
      {
        kind: "workflow",
        workflow: "create-module",
        label: "New module",
        inputs: { app: "demo" },
        command: "akan workflow plan create-module --app demo --module <module>",
      },
    ]);
  });
});

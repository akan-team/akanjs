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
    expect(StudioActions.of(node("model:apps/demo:memo", {})).map(({ workflow }) => workflow)).toEqual([
      "add-field",
      "add-enum-field",
      "add-mutation",
      "add-slice",
      "create-ui",
    ]);
    const [addField] = StudioActions.of(
      node("scalar:libs/shared:geo", { kind: "scalar", owner: "libs/shared", module: "geo" }),
    );
    expect(addField).toEqual({
      workflow: "add-field",
      label: "Add field",
      inputs: { app: "shared", module: "geo" },
      command: "akan workflow plan add-field --app shared --module geo --field <field> --type <type>",
    });
    expect(
      StudioActions.of(
        node("slice:apps/demo:memo.inPublic", { kind: "slice", name: "inPublic", label: "memo.inPublic" }),
      ),
    ).toEqual([
      {
        workflow: "rename-key",
        label: "Rename slice key",
        inputs: { app: "demo", module: "memo", slice: "inPublic" },
        command: "akan workflow plan rename-key --app demo --module memo --slice inPublic --to <to>",
      },
    ]);
    expect(
      StudioActions.of(node("query:apps/demo:memo.byTitle", { kind: "query", name: "byTitle" }))[0].inputs,
    ).toEqual({
      app: "demo",
      module: "memo",
      query: "byTitle",
    });
  });

  test("offers nothing for a node with no workflow, a default slice or query, or a removed node", () => {
    expect(StudioActions.of(node("method:apps/demo:memo.list", { kind: "method", name: "list" }))).toEqual([]);
    expect(StudioActions.of(node("slice:apps/demo:memo", { kind: "slice", name: "" }))).toEqual([]);
    expect(StudioActions.of(node("query:apps/demo:memo", { kind: "query", name: "" }))).toEqual([]);
    expect(StudioActions.of(node("model:apps/demo:memo", { change: "removed" }))).toEqual([]);
    expect(StudioActions.of(node("model:memo", { owner: null }))).toEqual([]);
  });

  test("offers a new module for the app", () => {
    expect(StudioActions.ofApp("demo")).toEqual([
      {
        workflow: "create-module",
        label: "New module",
        inputs: { app: "demo" },
        command: "akan workflow plan create-module --app demo --module <module>",
      },
    ]);
  });
});

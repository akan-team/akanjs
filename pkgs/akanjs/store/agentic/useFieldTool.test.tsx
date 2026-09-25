import "../../test/registerDom";
import { describe, expect, test } from "bun:test";
import { enumOf, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { store } from "../store";
import { StoreRegistry } from "../storeRegistry";
import { type FieldToolOptions, useFieldTool } from "./useFieldTool";

class FieldToolRole extends enumOf("fieldToolRole", ["owner", "guest"] as const) {}

const Row = via((f) => ({ key: f(String), weight: f(Int, { default: 0 }) }));
ConstantRegistry.buildScalar("fieldToolRow", Row, { Row });

const Input = via((f) => ({
  title: f(String),
  role: f(FieldToolRole),
  tags: f([String]),
  rows: f([Row]),
  note: f(String).optional(),
  password: f.secret(String),
}));
const Obj = via(Input, () => ({}));
const Light = via(Obj, ["title"] as const, () => ({}));
const Full = via(Obj, Light, () => ({}));
const Insight = via(Full, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel("fieldToolItem", Input, Obj, Full, Light, Insight, {});

const written: [string, unknown][] = [];
class FieldToolStore extends store("fieldTool" as const, () => ({
  fieldToolItemForm: {} as { [key: string]: unknown },
})) {
  setTitleOnFieldToolItem(value: string) {
    written.push(["title", value]);
  }
  setTagsOnFieldToolItem(value: string[]) {
    written.push(["tags", value]);
  }
  setNoteOnFieldToolItem(value: string | null) {
    written.push(["note", value]);
  }
  setRowsOnFieldToolItem(value: unknown) {
    written.push(["rows", value]);
  }
  // Stand in for the generated array actions, which only exist on a store built from a signal.
  addRowsOnFieldToolItem(value: unknown) {
    written.push(["addRows", value]);
  }
  subRowsOnFieldToolItem(idxs: unknown) {
    written.push(["subRows", idxs]);
  }
  setPasswordOnFieldToolItem(value: string) {
    written.push(["password", value]);
  }
}
StoreRegistry.register(FieldToolStore);
// The registry's own instance, because the row tools dispatch through `StoreRegistry.instance` the way an app does.
StoreRegistry.instance.addStore(StoreRegistry.merge("fieldToolRoot", FieldToolStore));
const instance = StoreRegistry.instance;
const dispatch = instance.do as unknown as { [key: string]: (value: unknown) => void };

const mount = (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return () => {
    act(() => root.unmount());
    container.remove();
  };
};

const control = (surface: AgenticSurface, onChange: unknown, options?: FieldToolOptions) => {
  const Control = () => {
    useFieldTool(onChange, options);
    return null;
  };
  return (
    <AgentProvider surface={surface}>
      <Control />
    </AgentProvider>
  );
};

describe("useFieldTool", () => {
  test("a control holding the setter by reference publishes it, and unmounting takes it back", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(control(surface, dispatch.setTitleOnFieldToolItem));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["setTitleOnFieldToolItem"]);
    expect(surface.snapshot().tools[0]?.parameters).toEqual({
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    });
    await surface.call("setTitleOnFieldToolItem", { value: "Ada" });
    expect(written).toEqual([["title", "Ada"]]);
    unmount();
    expect(surface.snapshot().tools).toHaveLength(0);
  });

  test("an inline arrow names nothing, so it publishes nothing", () => {
    const surface = new AgenticSurface();
    const unmount = mount(control(surface, (value: string) => void written.push(["title", value])));

    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });

  test("a list control takes the whole list, checked element by element", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(control(surface, dispatch.setTagsOnFieldToolItem));

    expect(surface.snapshot().tools[0]?.parameters).toEqual({
      type: "object",
      properties: { value: { type: "array", items: { type: "string" } } },
      required: ["value"],
      additionalProperties: false,
    });
    await surface.call("setTagsOnFieldToolItem", { value: ["a", "b"] });
    expect(written).toEqual([["tags", ["a", "b"]]]);
    await expect(surface.call("setTagsOnFieldToolItem", { value: ["a", 2] })).rejects.toThrow(
      '"value[1]" of setTagsOnFieldToolItem must be a string.',
    );
    unmount();
  });

  test("the control's transform runs on the agent's write too, so both paths store one shape", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(
      control(surface, dispatch.setTitleOnFieldToolItem, { transform: (value: string) => value.trim().toUpperCase() }),
    );

    await surface.call("setTitleOnFieldToolItem", { value: "  ada  " });
    expect(written).toEqual([["title", "ADA"]]);
    unmount();
  });

  test("a transform normalizes one scalar, so a list control applies it per element", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(
      control(surface, dispatch.setTagsOnFieldToolItem, { transform: (value: string) => value.toUpperCase() }),
    );

    await surface.call("setTagsOnFieldToolItem", { value: ["a", "b"] });
    expect(written).toEqual([["tags", ["A", "B"]]]);
    unmount();
  });

  test("clearing a nullable field stays null — a normalizer written for a value would invent one", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(
      control(surface, dispatch.setNoteOnFieldToolItem, { transform: (value: string) => `[${value}]` }),
    );

    await surface.call("setNoteOnFieldToolItem", {});
    expect(written).toEqual([["note", null]]);
    unmount();
  });

  test("an embedded-row array also publishes append and remove-by-index", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(control(surface, dispatch.setRowsOnFieldToolItem));
    const rowSchema = {
      type: "object",
      properties: { key: { type: "string" }, weight: { type: "integer" } },
      additionalProperties: false,
    };

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual([
      "addRowsOnFieldToolItem",
      "setRowsOnFieldToolItem",
      "subRowsOnFieldToolItem",
    ]);
    expect(surface.snapshot().tools.find((tool) => tool.name === "addRowsOnFieldToolItem")?.parameters).toEqual({
      type: "object",
      properties: { values: { type: "array", items: rowSchema } },
      required: ["values"],
      additionalProperties: false,
    });
    expect(surface.snapshot().tools.find((tool) => tool.name === "subRowsOnFieldToolItem")?.parameters).toEqual({
      type: "object",
      properties: { idxs: { type: "array", items: { type: "integer" } } },
      required: ["idxs"],
      additionalProperties: false,
    });

    await surface.call("addRowsOnFieldToolItem", { values: [{ key: "spawn", weight: 2 }] });
    expect(written).toEqual([["addRows", [{ key: "spawn", weight: 2 }]]]);
    unmount();
    expect(surface.snapshot().tools).toHaveLength(0);
  });

  test("an appended row is checked field by field, so a bad row never reaches the form", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(control(surface, dispatch.setRowsOnFieldToolItem));

    await expect(surface.call("addRowsOnFieldToolItem", { values: [{ key: "a", weight: "two" }] })).rejects.toThrow(
      'Argument "values[0].weight" of addRowsOnFieldToolItem must be a whole number.',
    );
    await expect(surface.call("addRowsOnFieldToolItem", { values: [{ key: "a", other: 1 }] })).rejects.toThrow(
      '"values[0]" of addRowsOnFieldToolItem has no field "other".',
    );
    expect(written).toEqual([]);
    unmount();
  });

  test("removing a position the form does not have is refused with the row count", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(control(surface, dispatch.setRowsOnFieldToolItem));

    await expect(surface.call("subRowsOnFieldToolItem", { idxs: [] })).rejects.toThrow(
      '"idxs" of subRowsOnFieldToolItem takes at least one index.',
    );
    await expect(surface.call("subRowsOnFieldToolItem", { idxs: [0] })).rejects.toThrow(
      "rows has 0 rows, so 0 is out of range.",
    );
    expect(written).toEqual([]);
    unmount();
  });

  test("an array of primitives keeps one whole-array setter — there is no row to retype wrong", () => {
    const surface = new AgenticSurface();
    const unmount = mount(control(surface, dispatch.setTagsOnFieldToolItem));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["setTagsOnFieldToolItem"]);
    unmount();
  });

  test("a disabled control publishes nothing — the agent gets no lever the person cannot pull", () => {
    const surface = new AgenticSurface();
    const unmount = mount(control(surface, dispatch.setTitleOnFieldToolItem, { disabled: true }));

    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });

  test("a disabled embedded-row array withholds its append and remove tools too", () => {
    const surface = new AgenticSurface();
    const unmount = mount(control(surface, dispatch.setRowsOnFieldToolItem, { disabled: true }));

    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });

  test("disabling a mounted control takes its tool back, and re-enabling gives it again", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const Control = ({ disabled }: { disabled: boolean }) => {
      useFieldTool(dispatch.setTitleOnFieldToolItem, { disabled });
      return null;
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (disabled: boolean) =>
      act(() =>
        root.render(
          <AgentProvider surface={surface}>
            <Control disabled={disabled} />
          </AgentProvider>,
        ),
      );

    render(false);
    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["setTitleOnFieldToolItem"]);
    render(true);
    expect(surface.snapshot().tools).toHaveLength(0);
    render(false);
    await surface.call("setTitleOnFieldToolItem", { value: "Ada" });
    expect(written).toEqual([["title", "Ada"]]);
    act(() => root.unmount());
    container.remove();
  });

  test("a sortable list adds reorder-by-position, which touches no entry's content", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    instance.set({ fieldToolItemForm: { rows: [{ key: "a" }, { key: "b" }, { key: "c" }] } });
    const unmount = mount(control(surface, dispatch.setRowsOnFieldToolItem, { sortable: true }));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual([
      "addRowsOnFieldToolItem",
      "moveRowsOnFieldToolItem",
      "setRowsOnFieldToolItem",
      "subRowsOnFieldToolItem",
    ]);
    expect(surface.snapshot().tools.find((tool) => tool.name === "moveRowsOnFieldToolItem")?.parameters).toEqual({
      type: "object",
      properties: { from: { type: "integer" }, to: { type: "integer" } },
      required: ["from", "to"],
      additionalProperties: false,
    });

    await surface.call("moveRowsOnFieldToolItem", { from: 2, to: 0 });
    expect(written).toEqual([["rows", [{ key: "c" }, { key: "a" }, { key: "b" }]]]);
    unmount();
  });

  test("moving to a position the list does not have is refused with the count", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    instance.set({ fieldToolItemForm: { rows: [{ key: "a" }, { key: "b" }] } });
    const unmount = mount(control(surface, dispatch.setRowsOnFieldToolItem, { sortable: true }));

    await expect(surface.call("moveRowsOnFieldToolItem", { from: 0, to: 5 })).rejects.toThrow(
      "rows has 2 entries, so to is out of range.",
    );
    expect(written).toEqual([]);
    unmount();
  });

  test("a sortable list of primitives reorders too — the gesture is the same", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    instance.set({ fieldToolItemForm: { tags: ["x", "y", "z"] } });
    const unmount = mount(control(surface, dispatch.setTagsOnFieldToolItem, { sortable: true }));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual([
      "moveTagsOnFieldToolItem",
      "setTagsOnFieldToolItem",
    ]);
    await surface.call("moveTagsOnFieldToolItem", { from: 0, to: 2 });
    expect(written).toEqual([["tags", ["y", "z", "x"]]]);
    unmount();
  });

  test("reordering skips the transform — the values are stored already, and dragging normalizes nothing", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    instance.set({ fieldToolItemForm: { tags: ["x", "y"] } });
    const unmount = mount(
      control(surface, dispatch.setTagsOnFieldToolItem, {
        sortable: true,
        transform: (value: string) => value.toUpperCase(),
      }),
    );

    await surface.call("moveTagsOnFieldToolItem", { from: 1, to: 0 });
    expect(written).toEqual([["tags", ["y", "x"]]]);
    unmount();
  });

  test("a scalar field publishes no reorder tool even when the control says it sorts", () => {
    const surface = new AgenticSurface();
    const unmount = mount(control(surface, dispatch.setTitleOnFieldToolItem, { sortable: true }));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["setTitleOnFieldToolItem"]);
    unmount();
  });

  test("a secret field publishes nothing even when its control renders", () => {
    const surface = new AgenticSurface();
    const unmount = mount(control(surface, dispatch.setPasswordOnFieldToolItem));

    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });
});

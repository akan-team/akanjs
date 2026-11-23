import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { enumOf, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { mount } from "../mount.fixture";
import { store } from "../store";
import { StoreRegistry } from "../storeRegistry";
import { loadFieldTools } from "./fieldTools";
import { FormFields } from "./formFields";
import { type FieldToolOptions, type FileFieldSource, useFieldTool, useFileFieldTool } from "./useFieldTool";

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

beforeAll(loadFieldTools);

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

const FileInput = via((f) => ({ filename: f(String) }));
const FileObj = via(FileInput, () => ({}));
const FileLight = via(FileObj, ["filename"] as const, () => ({}));
const FileFull = via(FileObj, FileLight, () => ({}));
const FileInsight = via(FileFull, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel("fileToolFile", FileInput, FileObj, FileFull, FileLight, FileInsight, {});

const CutInput = via((f) => ({
  title: f(String),
  image: f(FileLight),
  refImages: f([FileLight]),
  cover: f(FileLight).optional(),
}));
const CutObj = via(CutInput, () => ({}));
const CutLight = via(CutObj, ["title"] as const, () => ({}));
const CutFull = via(CutObj, CutLight, () => ({}));
const CutInsight = via(CutFull, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel("fileToolCut", CutInput, CutObj, CutFull, CutLight, CutInsight, {});

interface Picture {
  id: string;
  filename: string;
}

class FileToolStore extends store("fileTool" as const, () => ({
  fileToolCutForm: {} as { [key: string]: unknown },
})) {
  setImageOnFileToolCut(value: unknown) {
    written.push(["image", value]);
  }
  setRefImagesOnFileToolCut(value: unknown) {
    written.push(["refImages", value]);
  }
  setCoverOnFileToolCut(value: unknown) {
    written.push(["cover", value]);
  }
  addRefImagesOnFileToolCut(value: unknown) {
    written.push(["addRefImages", value]);
  }
  subRefImagesOnFileToolCut(idxs: unknown) {
    written.push(["subRefImages", idxs]);
  }
}
StoreRegistry.register(FileToolStore);
StoreRegistry.instance.addStore(StoreRegistry.merge("fileToolRoot", FileToolStore));

const pictures: Picture[] = [
  { id: "f1", filename: "hero.png" },
  { id: "f2", filename: "logo.png" },
];

const source = (
  held: Picture[],
  options: { disabled?: boolean; max?: number; min?: number } = {},
): FileFieldSource<Picture> => ({
  read: () => held,
  label: (file) => file.filename,
  ...options,
});

const toolOf = (surface: AgenticSurface, name: string) => surface.snapshot().tools.find((tool) => tool.name === name);

const fileControl = (surface: AgenticSurface, onChange: unknown, src: FileFieldSource<Picture>) => {
  const Control = () => {
    useFileFieldTool(onChange, src);
    return null;
  };
  return (
    <AgentProvider surface={surface}>
      <Control />
    </AgentProvider>
  );
};

describe("useFileFieldTool", () => {
  test("an upload control publishes a listing tool and an id-taking setter", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(fileControl(surface, dispatch.setImageOnFileToolCut, source(pictures)));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual([
      "loadImageOptionsOnFileToolCut",
      "setImageOnFileToolCut",
    ]);
    expect(toolOf(surface, "setImageOnFileToolCut")?.parameters).toEqual({
      type: "object",
      properties: { imageId: { type: "string" } },
      required: ["imageId"],
      additionalProperties: false,
    });
    expect(await surface.call("loadImageOptionsOnFileToolCut")).toEqual([
      { id: "f1", label: "hero.png" },
      { id: "f2", label: "logo.png" },
    ]);

    await surface.call("setImageOnFileToolCut", { imageId: "f2" });
    expect(written).toEqual([["image", { id: "f2", filename: "logo.png" }]]);
    unmount();
    expect(surface.snapshot().tools).toHaveLength(0);
  });

  test("an id no file answers to is refused by name, with what the screen is holding", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(fileControl(surface, dispatch.setImageOnFileToolCut, source(pictures)));

    await expect(surface.call("setImageOnFileToolCut", { imageId: "f9" })).rejects.toThrow(
      "The fileToolCut form offers no file f9. It offers: f1 (hero.png), f2 (logo.png).",
    );
    expect(written).toEqual([]);
    unmount();
  });

  test("with nothing attached yet the refusal says so instead of listing an empty set", async () => {
    const surface = new AgenticSurface();
    const unmount = mount(fileControl(surface, dispatch.setImageOnFileToolCut, source([])));

    await expect(surface.call("setImageOnFileToolCut", { imageId: "f1" })).rejects.toThrow(
      "No file is offered for image yet — one has to be attached or uploaded first.",
    );
    unmount();
  });

  test("on a list the refusal names the boundary and routes, since the field's own ids are real", async () => {
    const surface = new AgenticSurface();
    instance.set({ fileToolCutForm: { refImages: [{ id: "older" }] } });
    const unmount = mount(fileControl(surface, dispatch.setRefImagesOnFileToolCut, source(pictures)));

    await expect(surface.call("setRefImagesOnFileToolCut", { refImagesIds: ["older"] })).rejects.toThrow(
      "A file already on refImages may not be offered at all — it can only be removed by position, with subRefImagesOnFileToolCut.",
    );
    unmount();

    const one = new AgenticSurface();
    const off = mount(fileControl(one, dispatch.setImageOnFileToolCut, source(pictures)));
    const refusal = await one
      .call("setImageOnFileToolCut", { imageId: "older" })
      .catch((error: Error) => error.message);
    expect(refusal).toBe("The fileToolCut form offers no file older. It offers: f1 (hero.png), f2 (logo.png).");
    off();
  });

  test("a file list takes ids, and appending leaves what is already there alone", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    instance.set({ fileToolCutForm: { refImages: [{ id: "f1" }] } });
    const unmount = mount(fileControl(surface, dispatch.setRefImagesOnFileToolCut, source(pictures)));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual([
      "addRefImagesOnFileToolCut",
      "loadRefImagesOptionsOnFileToolCut",
      "setRefImagesOnFileToolCut",
      "subRefImagesOnFileToolCut",
    ]);
    expect(toolOf(surface, "setRefImagesOnFileToolCut")?.parameters).toEqual({
      type: "object",
      properties: { refImagesIds: { type: "array", items: { type: "string" } } },
      required: ["refImagesIds"],
      additionalProperties: false,
    });

    await surface.call("setRefImagesOnFileToolCut", { refImagesIds: ["f2", "f1"] });
    await surface.call("addRefImagesOnFileToolCut", { refImagesIds: ["f2"] });
    await surface.call("subRefImagesOnFileToolCut", { idxs: [0] });
    expect(written).toEqual([
      [
        "refImages",
        [
          { id: "f2", filename: "logo.png" },
          { id: "f1", filename: "hero.png" },
        ],
      ],
      ["addRefImages", [{ id: "f2", filename: "logo.png" }]],
      ["subRefImages", [0]],
    ]);
    unmount();
  });

  test("a position no file sits at is refused against the list the form is holding", async () => {
    const surface = new AgenticSurface();
    instance.set({ fileToolCutForm: { refImages: [{ id: "f1" }] } });
    const unmount = mount(fileControl(surface, dispatch.setRefImagesOnFileToolCut, source(pictures)));

    await expect(surface.call("subRefImagesOnFileToolCut", { idxs: [] })).rejects.toThrow(
      '"idxs" of subRefImagesOnFileToolCut takes at least one position.',
    );
    await expect(surface.call("subRefImagesOnFileToolCut", { idxs: [1] })).rejects.toThrow(
      "refImages holds 1 file, so 1 is out of range.",
    );
    unmount();
  });

  test("a nullable file field can be cleared, so its id is optional", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(fileControl(surface, dispatch.setCoverOnFileToolCut, source(pictures)));

    expect(toolOf(surface, "setCoverOnFileToolCut")?.parameters).toEqual({
      type: "object",
      properties: { coverId: { type: "string" } },
      additionalProperties: false,
    });
    await surface.call("setCoverOnFileToolCut", {});
    expect(written).toEqual([["cover", null]]);
    unmount();
  });

  test("a cap refuses the append that would break it, and says so ahead of the call", async () => {
    const surface = new AgenticSurface();
    instance.set({ fileToolCutForm: { refImages: [{ id: "f1" }, { id: "f2" }] } });
    const unmount = mount(fileControl(surface, dispatch.setRefImagesOnFileToolCut, source(pictures, { max: 2 })));

    expect(toolOf(surface, "addRefImagesOnFileToolCut")?.description).toContain("It holds at most 2 files.");
    await expect(surface.call("addRefImagesOnFileToolCut", { refImagesIds: ["f1"] })).rejects.toThrow(
      "refImages holds at most 2 files, and that would make 3. Remove one with subRefImagesOnFileToolCut first.",
    );
    await expect(surface.call("setRefImagesOnFileToolCut", { refImagesIds: ["f1", "f2", "f1"] })).rejects.toThrow(
      "refImages holds at most 2 files, and that would make 3.",
    );
    unmount();
  });

  test("a floor refuses the removal that would break it", async () => {
    const surface = new AgenticSurface();
    instance.set({ fileToolCutForm: { refImages: [{ id: "f1" }] } });
    const unmount = mount(fileControl(surface, dispatch.setRefImagesOnFileToolCut, source(pictures, { min: 1 })));

    await expect(surface.call("subRefImagesOnFileToolCut", { idxs: [0] })).rejects.toThrow(
      "refImages holds at least 1 file, and that would leave 0. Replace one with addRefImagesOnFileToolCut instead.",
    );
    unmount();
  });

  test("an uncapped field says nothing about a cap", () => {
    const surface = new AgenticSurface();
    const unmount = mount(fileControl(surface, dispatch.setRefImagesOnFileToolCut, source(pictures)));
    expect(toolOf(surface, "addRefImagesOnFileToolCut")?.description).not.toContain("at most");
    unmount();
  });

  test("no candidate list publishes nothing — a shared control forwards an optional tray", () => {
    const surface = new AgenticSurface();
    const Control = () => {
      useFileFieldTool(dispatch.setImageOnFileToolCut, { label: (file: Picture) => file.filename });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Control />
      </AgentProvider>,
    );
    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });

  test("the listing tool is named the same as the relation picker's, so one spelling serves both", () => {
    const surface = new AgenticSurface();
    const unmount = mount(fileControl(surface, dispatch.setImageOnFileToolCut, source(pictures)));
    expect(toolOf(surface, FormFields.optionsToolName("fileToolCut", "image"))).toBeDefined();
    unmount();
  });

  test("an inline arrow names nothing, so it publishes nothing", () => {
    const surface = new AgenticSurface();
    const unmount = mount(
      fileControl(surface, (value: unknown) => void written.push(["image", value]), source(pictures)),
    );
    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });

  test("a disabled control publishes nothing — the screen offers the person no lever either", () => {
    const surface = new AgenticSurface();
    const unmount = mount(fileControl(surface, dispatch.setImageOnFileToolCut, source(pictures, { disabled: true })));
    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });

  test("a field the form can describe on its own is left to useFieldTool", () => {
    const surface = new AgenticSurface();
    const Control = () => {
      useFileFieldTool(dispatch.setTitleOnFileToolCut, source(pictures));
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Control />
      </AgentProvider>,
    );
    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });
});

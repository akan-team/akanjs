import "../../test/registerDom";
import { describe, expect, test } from "bun:test";
import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { mount } from "../mount.fixture";
import { store } from "../store";
import { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import { loadFieldTools } from "./fieldTools";
import { useFieldTool } from "./useFieldTool";

const Input = via((f) => ({ title: f(String), note: f(String).optional() }));
const Obj = via(Input, () => ({}));
const Light = via(Obj, ["title"] as const, () => ({}));
const Full = via(Obj, Light, () => ({}));
const Insight = via(Full, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel("lateItem", Input, Obj, Full, Light, Insight, {});

const written: [string, unknown][] = [];
class LateStore extends store("late" as const, () => ({
  lateItemForm: {} as { [key: string]: unknown },
})) {
  setTitleOnLateItem(value: string) {
    written.push(["title", value]);
  }
  setNoteOnLateItem(value: string | null) {
    written.push(["note", value]);
  }
}
StoreRegistry.register(LateStore);
const instance = new StoreInstance(StoreRegistry.merge("lateRoot", LateStore));
const dispatch = instance.do as unknown as { [key: string]: (value: unknown) => void };

const Form = () => {
  instance.use.lateItemForm();
  return null;
};
const Control = ({ onChange }: { onChange: unknown }) => {
  useFieldTool(onChange);
  return null;
};

const names = (surface: AgenticSurface) => surface.snapshot().tools.map((tool) => tool.name);

describe("field tools", () => {
  test("a form mounted before the builders load publishes nothing until they arrive, then its setters and patch", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmountEarly = mount(
      <AgentProvider surface={surface}>
        <Control onChange={dispatch.setNoteOnLateItem} />
      </AgentProvider>,
    );
    unmountEarly();
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Form />
        <Control onChange={dispatch.setTitleOnLateItem} />
      </AgentProvider>,
    );
    expect(names(surface)).toEqual([]);

    await loadFieldTools();

    expect(names(surface)).toEqual(["fillLateItemForm", "setTitleOnLateItem"]);
    await surface.call("fillLateItemForm", { title: "Ada" });
    expect(written).toEqual([["title", "Ada"]]);
    unmount();
    expect(names(surface)).toEqual([]);
  });

  test("a control mounted after the builders loaded publishes as it mounts", async () => {
    await loadFieldTools();
    const surface = new AgenticSurface();
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Control onChange={dispatch.setNoteOnLateItem} />
      </AgentProvider>,
    );

    expect(names(surface)).toEqual(["setNoteOnLateItem"]);
    unmount();
  });
});

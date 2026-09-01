import "../../test/registerDom";
import { describe, expect, test } from "bun:test";
import { DataList, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { store } from "../store";
import { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import { useRelationFieldTool } from "./useRelationFieldTool";

const OrgInput = via((f) => ({ name: f(String) }));
const OrgObj = via(OrgInput, () => ({}));
const OrgLight = via(OrgObj, ["name"] as const, () => ({}));
const OrgFull = via(OrgObj, OrgLight, () => ({}));
const OrgInsight = via(OrgFull, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel("relOrg", OrgInput, OrgObj, OrgFull, OrgLight, OrgInsight, {});

const Input = via((f) => ({
  title: f(String),
  org: f(OrgLight),
  orgs: f([OrgLight]),
  sponsor: f(OrgLight).optional(),
}));
const Obj = via(Input, () => ({}));
const Light = via(Obj, ["title"] as const, () => ({}));
const Full = via(Obj, Light, () => ({}));
const Insight = via(Full, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel("relItem", Input, Obj, Full, Light, Insight, {});

interface Org {
  id: string;
  name: string;
}

const written: [string, unknown][] = [];
let loads = 0;
class RelStore extends store("rel" as const, () => ({
  relItemForm: {} as { [key: string]: unknown },
})) {
  setTitleOnRelItem(value: string) {
    written.push(["title", value]);
  }
  setOrgOnRelItem(value: unknown) {
    written.push(["org", value]);
  }
  setOrgsOnRelItem(value: unknown) {
    written.push(["orgs", value]);
  }
  setSponsorOnRelItem(value: unknown) {
    written.push(["sponsor", value]);
  }
}
StoreRegistry.register(RelStore);
const instance = new StoreInstance(StoreRegistry.merge("relRoot", RelStore));
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

/** Empty until `load` runs, the way a slice list is until the dropdown opens. */
const source = (loaded: Org[], options: { disabled?: boolean } = {}) => {
  let list = new DataList<Org>([]);
  return {
    read: () => list,
    load: () => {
      loads += 1;
      list = new DataList<Org>(loaded);
      return Promise.resolve();
    },
    label: (org: Org) => org.name,
    ...options,
  };
};

const control = (surface: AgenticSurface, onChange: unknown, src: ReturnType<typeof source>) => {
  const Control = () => {
    useRelationFieldTool(onChange, src);
    return null;
  };
  return (
    <AgentProvider surface={surface}>
      <Control />
    </AgentProvider>
  );
};

const orgs: Org[] = [
  { id: "org-1", name: "Acme" },
  { id: "org-2", name: "Globex" },
];

describe("useRelationFieldTool", () => {
  test("a relation picker publishes a listing tool and an id-taking setter", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    loads = 0;
    const unmount = mount(control(surface, dispatch.setOrgOnRelItem, source(orgs)));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["loadOrgOptionsOnRelItem", "setOrgOnRelItem"]);
    expect(surface.snapshot().tools[1]?.parameters).toEqual({
      type: "object",
      properties: { orgId: { type: "string" } },
      required: ["orgId"],
      additionalProperties: false,
    });

    // The list is empty before the load, so the refusal points at the tool that fills it rather than at an id.
    await expect(surface.call("setOrgOnRelItem", { orgId: "org-1" })).rejects.toThrow(
      "No relOrg is loaded yet. Call loadOrgOptionsOnRelItem first for the ids.",
    );
    expect(await surface.call("loadOrgOptionsOnRelItem")).toEqual([
      { id: "org-1", label: "Acme" },
      { id: "org-2", label: "Globex" },
    ]);
    expect(loads).toBe(1);

    await surface.call("setOrgOnRelItem", { orgId: "org-2" });
    expect(written).toEqual([["org", { id: "org-2", name: "Globex" }]]);
    unmount();
    expect(surface.snapshot().tools).toHaveLength(0);
  });

  test("an unknown id is refused by name, with the options it could have sent", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(control(surface, dispatch.setOrgOnRelItem, source(orgs)));

    await surface.call("loadOrgOptionsOnRelItem");
    await expect(surface.call("setOrgOnRelItem", { orgId: "org-9" })).rejects.toThrow(
      "The relItem form offers no relOrg org-9. It offers: org-1 (Acme), org-2 (Globex).",
    );
    expect(written).toEqual([]);
    unmount();
  });

  test("a list relation takes an array of ids and resolves each one", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(control(surface, dispatch.setOrgsOnRelItem, source(orgs)));

    expect(surface.snapshot().tools[1]?.parameters).toEqual({
      type: "object",
      properties: { orgsIds: { type: "array", items: { type: "string" } } },
      required: ["orgsIds"],
      additionalProperties: false,
    });
    await surface.call("loadOrgsOptionsOnRelItem");
    await surface.call("setOrgsOnRelItem", { orgsIds: ["org-2", "org-1"] });
    expect(written).toEqual([
      [
        "orgs",
        [
          { id: "org-2", name: "Globex" },
          { id: "org-1", name: "Acme" },
        ],
      ],
    ]);
    unmount();
  });

  test("a nullable relation can be cleared, so its id is optional", async () => {
    const surface = new AgenticSurface();
    written.length = 0;
    const unmount = mount(control(surface, dispatch.setSponsorOnRelItem, source(orgs)));

    expect(surface.snapshot().tools[1]?.parameters).toEqual({
      type: "object",
      properties: { sponsorId: { type: "string" } },
      additionalProperties: false,
    });
    await surface.call("setSponsorOnRelItem", {});
    expect(written).toEqual([["sponsor", null]]);
    unmount();
  });

  test("an inline arrow names nothing, so it publishes nothing", () => {
    const surface = new AgenticSurface();
    const unmount = mount(control(surface, (value: unknown) => void written.push(["org", value]), source(orgs)));

    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });

  test("a disabled control publishes nothing — the screen offers the person no lever either", () => {
    const surface = new AgenticSurface();
    const unmount = mount(control(surface, dispatch.setOrgOnRelItem, source(orgs, { disabled: true })));

    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });

  test("a field the form can describe on its own is left to useFieldTool", () => {
    const surface = new AgenticSurface();
    const unmount = mount(control(surface, dispatch.setTitleOnRelItem, source(orgs)));

    expect(surface.snapshot().tools).toHaveLength(0);
    unmount();
  });
});

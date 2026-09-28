import { describe, expect, test } from "bun:test";
import { AgentActivity } from "./AgentActivity";
import { AgenticSurface } from "./AgenticSurface";
import { AgentProvider } from "./AgentProvider";
import { AgentScope } from "./AgentScope";
import { useAgentGate } from "./surfaceContext";
import { mount } from "./test/mount";
import { useAgentGuide } from "./useAgentGuide";
import { useAgentResource } from "./useAgentResource";
import { useAgentTool } from "./useAgentTool";

const Page = ({ name }: { name: string }) => {
  useAgentTool(`save${name}`, { description: `Save ${name}.` }, () => name);
  useAgentResource(`${name.toLowerCase()}Title`, name);
  useAgentGuide(`${name} rules.`);
  return null;
};

describe("AgentActivity", () => {
  test("publishes what is registered below only while active, and a flip registers nothing again", () => {
    const surface = new AgenticSurface();
    const register = surface.registerTool.bind(surface);
    let registered = 0;
    surface.registerTool = (...args) => {
      registered += 1;
      return register(...args);
    };
    const tree = (listActive: boolean) => (
      <AgentProvider surface={surface}>
        <AgentActivity active={listActive}>
          <Page name="List" />
        </AgentActivity>
        <AgentActivity active={!listActive}>
          <Page name="Item" />
        </AgentActivity>
      </AgentProvider>
    );
    const app = mount(tree(true));
    const snapshot = surface.snapshot();
    expect(snapshot.tools.map((entry) => entry.name)).toEqual(["saveList"]);
    expect(snapshot.resources.map((entry) => entry.name)).toEqual(["listTitle"]);
    expect(snapshot.guides).toEqual(["List rules."]);
    expect(registered).toBe(2);

    app.render(tree(false));
    const flipped = surface.snapshot();
    expect(flipped.tools.map((entry) => entry.name)).toEqual(["saveItem"]);
    expect(flipped.resources.map((entry) => entry.name)).toEqual(["itemTitle"]);
    expect(flipped.guides).toEqual(["Item rules."]);
    expect(registered).toBe(2);
    app.unmount();
    expect(surface.snapshot().tools).toEqual([]);
  });

  test("a nested activity closes with its parent, and scopes keep composing names through it", () => {
    const surface = new AgenticSurface();
    const seen: { gateActive: boolean | null } = { gateActive: null };
    const Probe = () => {
      seen.gateActive = useAgentGate()?.active ?? null;
      return null;
    };
    const tree = (pageActive: boolean) => (
      <AgentProvider surface={surface}>
        <AgentActivity active={pageActive}>
          <AgentScope id="tasks">
            <AgentActivity active>
              <Page name="Panel" />
              <Probe />
            </AgentActivity>
          </AgentScope>
        </AgentActivity>
      </AgentProvider>
    );
    const app = mount(tree(true));
    expect(surface.snapshot().tools.map((entry) => entry.name)).toEqual(["tasks.savePanel"]);
    expect(seen.gateActive).toBe(true);
    app.render(tree(false));
    expect(surface.snapshot().tools).toEqual([]);
    expect(surface.snapshot().scopes).toEqual([]);
    app.unmount();
  });
});

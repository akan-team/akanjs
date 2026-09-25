import { describe, expect, test } from "bun:test";
import { act, useState } from "react";
import { AgenticSurface } from "./AgenticSurface";
import { AgentProvider } from "./AgentProvider";
import { AgentScope } from "./AgentScope";
import { mount } from "./test/mount";
import { useAgentTool } from "./useAgentTool";

describe("useAgentTool", () => {
  test("registers under the enclosing scope for the mounted lifetime", () => {
    const surface = new AgenticSurface();
    const Tool = () => {
      useAgentTool("focus", { description: "Focus the scene" }, () => "done");
      return null;
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <AgentScope id="scene:a1">
          <Tool />
        </AgentScope>
      </AgentProvider>,
    );
    expect(surface.snapshot().tools.map((entry) => entry.name)).toEqual(["scene-a1.focus"]);
    app.unmount();
    expect(surface.snapshot().tools).toHaveLength(0);
  });

  test("the agent's call always runs the latest render's closure", async () => {
    const surface = new AgenticSurface();
    let bump = () => {};
    const Counter = () => {
      const [count, setCount] = useState(0);
      bump = () => setCount((prev) => prev + 1);
      useAgentTool("readCount", {}, () => count);
      return null;
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <Counter />
      </AgentProvider>,
    );
    expect(await surface.call("readCount")).toBe(0);
    act(() => bump());
    expect(await surface.call("readCount")).toBe(1);
    app.unmount();
  });

  test("guard and confirm read the latest render too", async () => {
    const surface = new AgenticSurface();
    let allow = () => {};
    const Gated = () => {
      const [ready, setReady] = useState(false);
      allow = () => setReady(true);
      useAgentTool(
        "start",
        { guard: () => (ready ? true : "not ready"), confirm: () => (ready ? "Run now?" : false) },
        () => "ran",
      );
      return null;
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <Gated />
      </AgentProvider>,
    );
    await expect(surface.call("start")).rejects.toThrow("not ready");
    act(() => allow());
    expect(await surface.call("start")).toBe("ran");
    const entry = surface.tool("start");
    expect(typeof entry?.confirm === "function" ? entry.confirm({}) : null).toBe("Run now?");
    app.unmount();
  });

  test("the returned callable keeps one identity across renders", () => {
    const surface = new AgenticSurface();
    const seen: Array<(args?: Record<string, unknown>) => Promise<unknown>> = [];
    const Tool = ({ label }: { label: string }) => {
      seen.push(useAgentTool("noop", {}, () => label));
      return null;
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <Tool label="a" />
      </AgentProvider>,
    );
    app.render(
      <AgentProvider surface={surface}>
        <Tool label="b" />
      </AgentProvider>,
    );
    expect(seen[0]).toBe(seen[1]);
    app.unmount();
  });

  test("without a provider, hooks land on the shared surface", () => {
    const Tool = () => {
      useAgentTool("orphan", {}, () => null);
      return null;
    };
    const app = mount(<Tool />);
    expect(AgenticSurface.shared.snapshot().tools.map((entry) => entry.name)).toContain("orphan");
    app.unmount();
    expect(AgenticSurface.shared.snapshot().tools.map((entry) => entry.name)).not.toContain("orphan");
  });
});

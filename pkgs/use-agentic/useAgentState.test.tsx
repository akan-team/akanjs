import { describe, expect, test } from "bun:test";
import { act, useState } from "react";
import { AgenticSurface } from "./AgenticSurface";
import { AgentProvider } from "./AgentProvider";
import { mount } from "./test/mount";
import { useAgentResource } from "./useAgentResource";
import { useAgentState } from "./useAgentState";

describe("useAgentState", () => {
  test("publishes a readable resource and no setter by default", () => {
    const surface = new AgenticSurface();
    const Panel = () => {
      const [tab] = useAgentState("activeTab", "info", { description: "Which detail tab is open" });
      return <output>{tab}</output>;
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    expect(surface.read("activeTab")).toBe("info");
    expect(surface.snapshot().tools).toHaveLength(0);
    app.unmount();
  });

  test("serialize shapes what the agent reads", () => {
    const surface = new AgenticSurface();
    const Panel = () => {
      useAgentState("scenes", [{ id: "s1", blob: "heavy" }], { serialize: (list) => list.map((item) => item.id) });
      return null;
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    expect(surface.read("scenes")).toEqual(["s1"]);
    app.unmount();
  });

  test("a set schema publishes a setter tool that drives the rendered value", async () => {
    const surface = new AgenticSurface();
    const Panel = () => {
      const [mode] = useAgentState("previewMode", "fit", { set: { type: "string", enum: ["fit", "fill"] } });
      return <output>{mode}</output>;
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    const setter = surface.snapshot().tools.find((entry) => entry.name === "setPreviewMode");
    expect(setter?.parameters).toEqual({
      type: "object",
      properties: { value: { type: "string", enum: ["fit", "fill"] } },
      required: ["value"],
      additionalProperties: false,
    });
    await act(async () => {
      await surface.call("setPreviewMode", { value: "fill" });
    });
    expect(app.container.textContent).toBe("fill");
    expect(surface.read("previewMode")).toBe("fill");
    app.unmount();
  });

  test("parse validates the setter's value and a throw refuses the write", async () => {
    const surface = new AgenticSurface();
    const Panel = () => {
      const [mode] = useAgentState("mode", "fit", {
        set: { type: "string" },
        parse: (value) => {
          if (value !== "fit" && value !== "fill") throw new Error("mode must be fit or fill");
          return value;
        },
      });
      return <output>{mode}</output>;
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    await act(async () => {
      await expect(surface.call("setMode", { value: "zoom" })).rejects.toThrow("mode must be fit or fill");
    });
    expect(app.container.textContent).toBe("fit");
    await act(async () => {
      await surface.call("setMode", { value: "fill" });
    });
    expect(app.container.textContent).toBe("fill");
    app.unmount();
  });
});

describe("useAgentResource", () => {
  test("publishes the latest rendered value read-only", () => {
    const surface = new AgenticSurface();
    let grow = () => {};
    const Panel = () => {
      const [seconds, setSeconds] = useState(40);
      grow = () => setSeconds((prev) => prev + 2);
      useAgentResource("totalSeconds", seconds, { description: "Total timeline length in seconds" });
      return null;
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    expect(surface.read("totalSeconds")).toBe(40);
    act(() => grow());
    expect(surface.read("totalSeconds")).toBe(42);
    app.unmount();
  });
});

import { describe, expect, test } from "bun:test";
import { act, useState } from "react";
import { Agentic } from "./Agentic";
import { AgenticSurface } from "./AgenticSurface";
import { AgentProvider } from "./AgentProvider";
import { AgentScope } from "./AgentScope";
import { mount } from "./test/mount";
import { useAgentTool } from "./useAgentTool";

describe("AgentScope", () => {
  test("nested scopes compose the tool path and publish labels", () => {
    const surface = new AgenticSurface();
    const Row = () => {
      useAgentTool("select", {}, () => null);
      return null;
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <AgentScope id="timeline" kind="scene">
          <AgentScope id="scene:s1" label="Intro">
            <Row />
          </AgentScope>
        </AgentScope>
      </AgentProvider>,
    );
    const snapshot = surface.snapshot();
    expect(snapshot.tools.map((entry) => entry.name)).toEqual(["timeline.scene-s1.select"]);
    expect(snapshot.scopes).toEqual([
      { path: "timeline", kind: "scene" },
      { path: "timeline.scene-s1", label: "Intro" },
    ]);
    app.unmount();
    expect(surface.snapshot().scopes).toHaveLength(0);
  });
});

describe("Agentic", () => {
  test("registers the child's onClick as a no-argument tool and renders it untouched", async () => {
    const surface = new AgenticSurface();
    let removed = 0;
    const List = () => {
      const [label, setLabel] = useState("삭제");
      return (
        <Agentic name="deleteScene" description="Delete this scene" confirm>
          <button
            type="button"
            onClick={() => {
              removed += 1;
              setLabel("삭제됨");
            }}
          >
            {label}
          </button>
        </Agentic>
      );
    };
    const app = mount(
      <AgentProvider surface={surface}>
        <List />
      </AgentProvider>,
    );
    expect(app.container.querySelector("button")?.textContent).toBe("삭제");
    const published = surface.snapshot().tools.find((entry) => entry.name === "deleteScene");
    expect(published?.needsConfirm).toBe(true);
    await act(async () => {
      await surface.call("deleteScene");
    });
    expect(removed).toBe(1);
    expect(app.container.querySelector("button")?.textContent).toBe("삭제됨");
    app.unmount();
  });
});

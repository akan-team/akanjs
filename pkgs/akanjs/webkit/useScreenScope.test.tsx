import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider, AgentScope } from "use-agentic";
import { useScreenScope } from "./useScreenScope";

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

describe("useScreenScope", () => {
  test("opens a scope with an items resource for the mounted lifetime", () => {
    const surface = new AgenticSurface();
    const List = () => {
      useScreenScope({
        id: "taskInOrg",
        kind: "task",
        items: () => [{ id: "t1", label: "Fix login" }],
      });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <List />
      </AgentProvider>,
    );
    expect(surface.snapshot().scopes).toEqual([{ path: "taskInOrg", kind: "task" }]);
    expect(surface.read("taskInOrg.items")).toEqual({ total: 1, items: [{ id: "t1", label: "Fix login" }] });
    unmount();
    expect(surface.snapshot().scopes).toHaveLength(0);
    expect(surface.snapshot().resources).toHaveLength(0);
  });

  test("opens under the scope it is mounted in, so a zone view sees its own list", () => {
    const surface = new AgenticSurface();
    const List = () => {
      useScreenScope({ id: "taskInOrg", kind: "task", items: () => [{ id: "t1" }] });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <AgentScope id="comments" kind="zone">
          <List />
        </AgentScope>
      </AgentProvider>,
    );
    expect(surface.read("comments.taskInOrg.items")).toEqual({ total: 1, items: [{ id: "t1" }] });
    expect(
      surface
        .view(["comments"])
        .snapshot()
        .resources.map((resource) => resource.name),
    ).toEqual(["comments.taskInOrg.items"]);
    unmount();
  });

  test("caps items and declares the truncation", () => {
    const surface = new AgenticSurface();
    const many = Array.from({ length: 150 }, (_, idx) => ({ id: `t${idx}` }));
    const List = () => {
      useScreenScope({ id: "big", kind: "task", items: () => many });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <List />
      </AgentProvider>,
    );
    const value = surface.read("big.items") as { total: number; items: unknown[]; truncated?: boolean };
    expect(value.total).toBe(150);
    expect(value.items).toHaveLength(100);
    expect(value.truncated).toBe(true);
    unmount();
  });

  test("a label-only scope registers no items resource", () => {
    const surface = new AgenticSurface();
    const Viewer = () => {
      useScreenScope({ id: "task-view", kind: "task", label: "Fix login" });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Viewer />
      </AgentProvider>,
    );
    expect(surface.snapshot().scopes).toEqual([{ path: "task-view", label: "Fix login", kind: "task" }]);
    expect(surface.snapshot().resources).toHaveLength(0);
    unmount();
  });
});

import "../../test/registerDom";
import { describe, expect, test } from "bun:test";
import { Any } from "akanjs/base";
import { via } from "akanjs/constant";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { StExposeDraft } from "./StExposeDraft";

const ExposeNote = via((f) => ({
  title: f(String),
  secretMemo: f.secret(String).optional(),
}));

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

describe("StExposeDraft", () => {
  test("the declared model masks the read, whether the value is an instance or a plain copy", () => {
    const surface = new AgenticSurface();
    const Panel = () => {
      new StExposeDraft("openNote", ExposeNote)
        .desc("The note the panel is showing.")
        .value({ title: "hello", secretMemo: "do not ship" });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    expect(surface.snapshot().resources).toEqual([
      { name: "openNote", description: "The note the panel is showing.", value: { title: "hello" } },
    ]);
    unmount();
  });

  test("Any publishes the value as it stands — nothing to mask it by, and nothing claimed", () => {
    const surface = new AgenticSurface();
    const Panel = () => {
      new StExposeDraft("payload", Any).desc("The payload being previewed.").value({ progress: 0.4 });
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    expect(surface.read("payload")).toEqual({ progress: 0.4 });
    unmount();
  });

  test("a thunk is read when the agent reads, not when the component rendered", () => {
    const surface = new AgenticSurface();
    const menus: string[] = [];
    const Panel = () => {
      new StExposeDraft("menus", Any).desc("The menus this tab offers.").value(() => [...menus]);
      menus.push("late");
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Panel />
      </AgentProvider>,
    );
    expect(surface.read("menus")).toEqual(["late"]);
    unmount();
  });

  test("a falsy name publishes nothing and still runs the hook", () => {
    const surface = new AgenticSurface();
    const Panel = ({ named }: { named: boolean }) => {
      new StExposeDraft(named ? "tab" : null, String).desc("The tab on screen.").value("info");
      return null;
    };
    const unmount = mount(
      <AgentProvider surface={surface}>
        <Panel named={false} />
      </AgentProvider>,
    );
    expect(surface.snapshot().resources).toEqual([]);
    unmount();
  });

  test("a type nothing can read leaves the component rendering and says so once", () => {
    const surface = new AgenticSurface();
    const errors: string[] = [];
    const error = console.error;
    console.error = (message: unknown) => errors.push(String(message));
    const Panel = () => {
      new StExposeDraft("job", Map as never).desc("The job in flight.").value(null);
      return <output>rendered</output>;
    };
    try {
      const unmount = mount(
        <AgentProvider surface={surface}>
          <Panel />
        </AgentProvider>,
      );
      expect(surface.snapshot().resources).toEqual([]);
      expect(errors).toHaveLength(1);
      unmount();
    } finally {
      console.error = error;
    }
  });
});

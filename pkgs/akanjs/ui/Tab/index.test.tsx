import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";

let Tab: typeof import("./index").Tab;

/** Imported after the environment is set: `akanjs/store`'s baseSt reads the env while the module evaluates. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "tabtest";
  process.env.AKAN_PUBLIC_REPO_NAME = "tabtest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  ({ Tab } = await import("./index"));
});

const mount = (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

/** happy-dom's dispatch never reaches a React synthetic handler; the fiber props are where the click actually is. */
const clickReact = (container: HTMLElement, text: string) => {
  for (const el of container.querySelectorAll("button, div, a")) {
    if (el.textContent !== text) continue;
    const key = Object.keys(el).find((name) => name.startsWith("__reactProps$"));
    const props = key ? (el as unknown as { [key: string]: { onClick?: () => void } })[key] : undefined;
    if (!props?.onClick) continue;
    act(() => props.onClick?.());
    return true;
  }
  return false;
};

const tabs = (surface: AgenticSurface, namespace?: string) => (
  <AgentProvider surface={surface}>
    <Tab defaultMenu="spec" namespace={namespace}>
      <Tab.Menus>
        <Tab.Menu menu="spec">Spec</Tab.Menu>
        <Tab.Menu menu="review">Review</Tab.Menu>
        <Tab.Menu menu="history" disabled>
          History
        </Tab.Menu>
      </Tab.Menus>
      <Tab.Panel menu="spec">spec body</Tab.Panel>
      <Tab.Panel menu="review">review body</Tab.Panel>
    </Tab>
  </AgentProvider>
);

describe("Tab", () => {
  test("publishes its menus and the switch its own buttons dispatch", async () => {
    const surface = new AgenticSurface();
    const { container, unmount } = mount(tabs(surface, "detail"));

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["switchTabInDetail"]);
    expect(surface.read("tabsInDetail")).toEqual({
      current: "spec",
      menus: [{ menu: "spec" }, { menu: "review" }, { menu: "history", disabled: true }],
    });
    expect(container.querySelectorAll('[data-akan-action="switchTabInDetail"]')).toHaveLength(3);

    await act(async () => {
      await surface.call("switchTabInDetail", { menu: "review" });
    });
    expect(container.querySelector("[data-menu]")?.getAttribute("data-menu")).toBe("review");
    unmount();
  });

  test("refuses a menu this tab does not offer, and one it draws as disabled", async () => {
    const surface = new AgenticSurface();
    const { unmount } = mount(tabs(surface, "detail"));

    await expect(surface.call("switchTabInDetail", { menu: "billing" })).rejects.toThrow(
      'No menu "billing" on this tab. It offers: spec, review, history.',
    );
    await expect(surface.call("switchTabInDetail", { menu: "history" })).rejects.toThrow(
      'The menu "history" is disabled.',
    );
    unmount();
  });

  test("without a namespace it publishes nothing and the buttons still switch", () => {
    const surface = new AgenticSurface();
    const { container, unmount } = mount(tabs(surface));

    expect(surface.snapshot().tools).toHaveLength(0);
    expect(surface.snapshot().resources).toHaveLength(0);
    expect(container.querySelector("[data-akan-action]")).toBeNull();

    expect(clickReact(container, "Review")).toBe(true);
    expect(container.querySelector("[data-menu]")?.getAttribute("data-menu")).toBe("review");
    unmount();
  });
});

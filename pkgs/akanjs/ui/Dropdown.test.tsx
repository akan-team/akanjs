import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";

let DefaultDropdown: typeof import("./Dropdown").DefaultDropdown;

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "dropdowntest";
  process.env.AKAN_PUBLIC_REPO_NAME = "dropdowntest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  ({ DefaultDropdown } = await import("./Dropdown"));
});

const mount = (content: ReactNode, options: { namespace?: string; surface?: AgenticSurface } = {}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const dropdown = <DefaultDropdown value="More" content={content} namespace={options.namespace} />;
  act(() =>
    root.render(options.surface ? <AgentProvider surface={options.surface}>{dropdown}</AgentProvider> : dropdown),
  );
  const trigger = container.querySelector("button");
  if (!trigger) throw new Error("dropdown trigger did not render");
  // The last one in the body: a portalled menu a failing test left behind would otherwise be read as this one.
  const menu = [...document.querySelectorAll("ul")].at(-1);
  if (!menu) throw new Error("dropdown menu did not render");
  return {
    container,
    trigger,
    menu,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

const render = (content: ReactNode) => {
  const mounted = mount(content);
  act(() => mounted.trigger.click());
  return mounted;
};

const item = (
  <li>
    <button type="button">Edit</button>
  </li>
);

describe("Dropdown", () => {
  test("renders the menu outside the trigger's subtree so no overflow ancestor clips it", () => {
    const { container, menu, unmount } = render(item);
    expect(menu.parentElement).toBe(document.body);
    expect(container.contains(menu)).toBe(false);
    expect(menu.hidden).toBe(false);
    expect(menu.style.position).toBe("fixed");
    unmount();
  });

  test("the menu is mounted and hidden before the first open, so a tool inside it is already declared", () => {
    const { menu, unmount } = mount(item);
    expect(menu.hidden).toBe(true);
    expect(menu.querySelector("button")?.textContent).toBe("Edit");
    unmount();
  });

  test("a click inside the portalled menu is not an outside click, and the item closes it", () => {
    const { menu, unmount } = render(item);
    const menuItem = menu.querySelector("button");
    if (!menuItem) throw new Error("menu item did not render");
    act(() => {
      menuItem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(menu.hidden).toBe(false);
    act(() => menuItem.click());
    expect(menu.hidden).toBe(true);
    unmount();
  });

  test("a keep-open item leaves the menu open", () => {
    const { menu, unmount } = render(
      <li data-dropdown-keep-open="">
        <button type="button">Notify</button>
      </li>,
    );
    const menuItem = menu.querySelector("button");
    if (!menuItem) throw new Error("menu item did not render");
    act(() => menuItem?.click());
    expect(menu.hidden).toBe(false);
    unmount();
  });

  test("a namespace publishes the open and close its own trigger dispatches", async () => {
    const surface = new AgenticSurface();
    const { container, menu, trigger, unmount } = mount(item, { namespace: "row", surface });

    expect(surface.snapshot().tools.map((tool) => tool.name)).toEqual(["closeDropdownInRow", "openDropdownInRow"]);
    expect(surface.read("dropdownInRow")).toBe(false);
    expect(trigger.getAttribute("data-akan-action")).toBe("openDropdownInRow");

    await act(async () => {
      await surface.call("openDropdownInRow", {});
    });
    expect(menu.hidden).toBe(false);
    expect(surface.read("dropdownInRow")).toBe(true);
    expect(container.querySelector("[data-akan-action]")?.getAttribute("data-akan-action")).toBe("closeDropdownInRow");

    await act(async () => {
      await surface.call("closeDropdownInRow", {});
    });
    expect(menu.hidden).toBe(true);
    unmount();
  });

  test("without a namespace it publishes nothing and the trigger still toggles", () => {
    const surface = new AgenticSurface();
    const { container, menu, trigger, unmount } = mount(item, { surface });

    expect(surface.snapshot().tools).toHaveLength(0);
    expect(surface.snapshot().resources).toHaveLength(0);
    expect(container.querySelector("[data-akan-action]")).toBeNull();

    act(() => trigger.click());
    expect(menu.hidden).toBe(false);
    act(() => trigger.click());
    expect(menu.hidden).toBe(true);
    unmount();
  });
});

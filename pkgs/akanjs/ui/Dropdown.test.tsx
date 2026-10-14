import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { mount as mountNode, setTestEnv } from "./testHelpers.fixture";

let DefaultDropdown: typeof import("./Dropdown").DefaultDropdown;

beforeAll(async () => {
  setTestEnv("dropdowntest");
  ({ DefaultDropdown } = await import("./Dropdown"));
});

const mount = (content: ReactNode, options: { namespace?: string; surface?: AgenticSurface } = {}) => {
  const dropdown = <DefaultDropdown value="More" content={content} namespace={options.namespace} />;
  const { container, unmount } = mountNode(
    options.surface ? <AgentProvider surface={options.surface}>{dropdown}</AgentProvider> : dropdown,
  );
  const trigger = container.querySelector("button");
  if (!trigger) throw new Error("dropdown trigger did not render");
  // The last one in the body: a portalled menu a failing test left behind would otherwise be read as this one.
  const menu = [...document.querySelectorAll("ul")].at(-1);
  if (!menu) throw new Error("dropdown menu did not render");
  return { container, trigger, menu, unmount };
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

  test("an item whose own trigger stops the click still closes the menu", () => {
    const { menu, unmount } = render(
      <li>
        <button type="button" onClick={(e) => e.stopPropagation()}>
          Edit
        </button>
      </li>,
    );
    const menuItem = menu.querySelector("button");
    if (!menuItem) throw new Error("menu item did not render");
    act(() => menuItem.click());
    expect(menu.hidden).toBe(true);
    unmount();
  });

  test("a click into a field in the menu, such as a searchable Select's input that stops the click, leaves it open", () => {
    const { menu, unmount } = render(
      <>
        <li>
          <div role="combobox" aria-expanded="false" aria-controls="options" tabIndex={-1}>
            <input type="text" aria-label="Search" onClick={(e) => e.stopPropagation()} />
          </div>
        </li>
        <li>
          <textarea aria-label="Note" />
        </li>
      </>,
    );
    const search = menu.querySelector("input");
    const note = menu.querySelector("textarea");
    if (!search || !note) throw new Error("menu fields did not render");
    act(() => search.click());
    expect(menu.hidden).toBe(false);
    act(() => note.click());
    expect(menu.hidden).toBe(false);
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

  test("a custom trigger keeps the menu's aria state on the caller's own control", () => {
    const { container, unmount } = mountNode(
      <DefaultDropdown
        trigger={
          <button className="w-full" type="button">
            More
          </button>
        }
        content={<li>Edit</li>}
      />,
    );
    const trigger = container.querySelector("button");
    // Cloned, not wrapped: a screen reader activates this button, so the disclosure state belongs on it.
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger?.className).toBe("w-full");
    act(() => trigger?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
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

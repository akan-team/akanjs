import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { l, mount, setTestEnv } from "./testHelpers.fixture";

let DefaultPopconfirm: typeof import("./Popconfirm").DefaultPopconfirm;
let DefaultDropdown: typeof import("./Dropdown").DefaultDropdown;

beforeAll(async () => {
  setTestEnv("popconfirmtest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }), fetch: {} } as never);
  ({ DefaultPopconfirm } = await import("./Popconfirm"));
  ({ DefaultDropdown } = await import("./Dropdown"));
});

const open = (onConfirm?: () => void) => {
  const { container, unmount } = mount(
    <DefaultPopconfirm title="Remove it?" onConfirm={onConfirm}>
      <button type="button">Remove</button>
    </DefaultPopconfirm>,
  );
  const trigger = container.querySelector("button");
  if (!trigger) throw new Error("popconfirm trigger did not render");
  act(() => trigger.click());
  const panel = document.querySelector('[role="dialog"]');
  if (!(panel instanceof HTMLElement)) throw new Error("popconfirm panel did not render");
  return { container, unmount, panel };
};

describe("Popconfirm", () => {
  test("renders the panel outside the trigger's subtree so no overflow ancestor clips it", () => {
    const { container, panel, unmount } = open();
    expect(panel.parentElement).toBe(document.body);
    expect(container.contains(panel)).toBe(false);
    expect(panel.style.position).toBe("fixed");
    // Stamped so a Dropdown that rendered this popconfirm reads a click here as its own, not as a dismissal.
    expect(panel.hasAttribute("data-akan-overlay")).toBe(true);
    unmount();
  });

  test("the scrim cancels without confirming", () => {
    let confirmed = false;
    const { unmount } = open(() => {
      confirmed = true;
    });
    const scrim = [...document.body.children].find(
      (child) => child instanceof HTMLElement && child.className.includes("inset-0"),
    );
    if (!(scrim instanceof HTMLElement)) throw new Error("popconfirm scrim did not render");
    act(() => scrim.click());
    expect(document.querySelector('[role="dialog"]')).toBe(null);
    expect(confirmed).toBe(false);
    unmount();
  });

  test("confirming runs onConfirm and closes the panel", () => {
    let confirmed = false;
    const { panel, unmount } = open(() => {
      confirmed = true;
    });
    const ok = [...panel.querySelectorAll("button")].at(-1);
    if (!ok) throw new Error("popconfirm ok button did not render");
    act(() => ok.click());
    expect(confirmed).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBe(null);
    unmount();
  });

  test("opened from a dropdown item, it leaves the menu open, because the panel is anchored to that row", () => {
    const { container, unmount } = mount(
      <DefaultDropdown
        value="More"
        content={
          <li>
            <DefaultPopconfirm title="Remove it?">
              <button type="button">Remove</button>
            </DefaultPopconfirm>
          </li>
        }
      />,
    );
    const menu = [...document.querySelectorAll("ul")].at(-1);
    const remove = menu?.querySelector("button");
    if (!menu || !remove) throw new Error("dropdown menu did not render");
    act(() => container.querySelector("button")?.click());
    act(() => remove.click());
    expect(document.querySelector('[role="dialog"]')).not.toBe(null);
    expect(menu.hidden).toBe(false);
    unmount();
  });
});

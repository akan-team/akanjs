import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";

let DefaultPopconfirm: typeof import("./Popconfirm").DefaultPopconfirm;

const l = Object.assign((key: string) => key, {
  _: (key: string) => key,
  rich: (key: string) => key,
  trans: (translation: Record<string, string>) => translation.en,
});

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "popconfirmtest";
  process.env.AKAN_PUBLIC_REPO_NAME = "popconfirmtest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }), fetch: {} } as never);
  ({ DefaultPopconfirm } = await import("./Popconfirm"));
});

const open = (onConfirm?: () => void) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <DefaultPopconfirm title="Remove it?" onConfirm={onConfirm}>
        <button type="button">Remove</button>
      </DefaultPopconfirm>,
    ),
  );
  const trigger = container.querySelector("button");
  if (!trigger) throw new Error("popconfirm trigger did not render");
  act(() => trigger.click());
  const panel = document.querySelector('[role="dialog"]');
  if (!(panel instanceof HTMLElement)) throw new Error("popconfirm panel did not render");
  return { container, root, panel };
};

describe("Popconfirm", () => {
  test("renders the panel outside the trigger's subtree so no overflow ancestor clips it", () => {
    const { container, panel, root } = open();
    expect(panel.parentElement).toBe(document.body);
    expect(container.contains(panel)).toBe(false);
    expect(panel.style.position).toBe("fixed");
    // Stamped so a Dropdown that rendered this popconfirm reads a click here as its own, not as a dismissal.
    expect(panel.hasAttribute("data-akan-overlay")).toBe(true);
    act(() => root.unmount());
  });

  test("the scrim cancels without confirming", () => {
    let confirmed = false;
    const { root } = open(() => {
      confirmed = true;
    });
    const scrim = [...document.body.children].find(
      (child) => child instanceof HTMLElement && child.className.includes("inset-0"),
    );
    if (!(scrim instanceof HTMLElement)) throw new Error("popconfirm scrim did not render");
    act(() => scrim.click());
    expect(document.querySelector('[role="dialog"]')).toBe(null);
    expect(confirmed).toBe(false);
    act(() => root.unmount());
  });

  test("confirming runs onConfirm and closes the panel", () => {
    let confirmed = false;
    const { panel, root } = open(() => {
      confirmed = true;
    });
    const ok = [...panel.querySelectorAll("button")].at(-1);
    if (!ok) throw new Error("popconfirm ok button did not render");
    act(() => ok.click());
    expect(confirmed).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBe(null);
    act(() => root.unmount());
  });
});

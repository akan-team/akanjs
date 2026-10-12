import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { mount, setTestEnv } from "./testHelpers.fixture";

let DefaultTooltip: typeof import("./Tooltip").Tooltip;

beforeAll(async () => {
  setTestEnv("tooltiptest");
  ({ Tooltip: DefaultTooltip } = await import("./Tooltip"));
});

const rect = (top: number, left: number, width: number, height: number) =>
  ({ top, left, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

describe("Tooltip", () => {
  test("draws its bubble on the overlay layer, outside the trigger, while the trigger has focus", async () => {
    const { container, unmount } = mount(
      <DefaultTooltip content="Copy id">
        <button type="button">copy</button>
      </DefaultTooltip>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const button = container.querySelector("button");
    if (!button) throw new Error("trigger did not render");
    act(() => button.focus());

    const bubble = document.body.querySelector('[role="tooltip"]');
    expect(bubble?.textContent).toBe("Copy id");
    expect(container.contains(bubble)).toBe(false);
    expect(container.querySelector("[aria-describedby]")?.getAttribute("aria-describedby")).toBe(bubble?.id ?? "");

    act(() => button.blur());
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
    unmount();
  });

  test("flips to the opposite side when the asked one has no room", async () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    const { container, unmount } = mount(
      <DefaultTooltip content="Near the top" side="top">
        <button type="button">edge</button>
      </DefaultTooltip>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const trigger = container.querySelector<HTMLElement>("[aria-describedby], span");
    const button = container.querySelector("button");
    if (!trigger || !button) throw new Error("trigger did not render");
    trigger.getBoundingClientRect = () => rect(4, 100, 40, 20);
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 24 });
    try {
      act(() => button.focus());
      const bubble = document.body.querySelector<HTMLElement>('[role="tooltip"]');
      expect(Number.parseFloat(bubble?.style.top ?? "0")).toBeGreaterThan(24);
    } finally {
      if (height) Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
      unmount();
    }
  });
});

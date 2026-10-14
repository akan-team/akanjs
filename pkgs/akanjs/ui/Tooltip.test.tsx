import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { createPortal } from "react-dom";
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

  test("focus or a pointer inside a portal its trigger renders, such as a modal it opened, leaves the bubble closed", async () => {
    const elsewhere = document.createElement("div");
    document.body.appendChild(elsewhere);
    const { unmount } = mount(
      <DefaultTooltip content="Add">
        <button type="button">add</button>
        {createPortal(<input aria-label="In the modal" />, elsewhere)}
      </DefaultTooltip>,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const field = elsewhere.querySelector("input");
      if (!field) throw new Error("portalled field did not render");

      act(() => field.focus());
      expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
      await act(async () => {
        field.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
        await new Promise((resolve) => setTimeout(resolve, 350));
      });
      expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
    } finally {
      unmount();
      elsewhere.remove();
    }
  });

  test("re-measures when its bubble resizes, so content that grows stays centred on the trigger", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
    const OriginalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      targets: Element[] = [];
      constructor(public callback: ResizeObserverCallback) {
        observers.push(this);
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    let bubbleWidth = 20;
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => bubbleWidth });
    const { container, unmount } = mount(
      <DefaultTooltip content="Saved" side="top">
        <button type="button">save</button>
      </DefaultTooltip>,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const trigger = container.querySelector<HTMLElement>("span");
      const button = container.querySelector("button");
      if (!trigger || !button) throw new Error("trigger did not render");
      trigger.getBoundingClientRect = () => rect(300, 100, 40, 20);
      act(() => button.focus());
      const bubble = document.body.querySelector<HTMLElement>('[role="tooltip"]');
      if (!bubble) throw new Error("bubble did not open");
      expect(Number.parseFloat(bubble.style.left)).toBe(110);

      const observer = observers.find((entry) => entry.targets.includes(bubble));
      expect(observer).toBeDefined();
      bubbleWidth = 60;
      act(() => observer?.callback([], observer as unknown as ResizeObserver));
      expect(Number.parseFloat(bubble.style.left)).toBe(90);
    } finally {
      unmount();
      globalThis.ResizeObserver = OriginalResizeObserver;
      if (width) Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
    }
  });

  test("a bubble above its trigger that grows taller moves up, so its bottom edge stays on the trigger", async () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
    const OriginalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      targets: Element[] = [];
      constructor(public callback: ResizeObserverCallback) {
        observers.push(this);
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    let bubbleHeight = 24;
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => bubbleHeight });
    const { container, unmount } = mount(
      <DefaultTooltip content="Saved" side="top">
        <button type="button">save</button>
      </DefaultTooltip>,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const trigger = container.querySelector<HTMLElement>("span");
      const button = container.querySelector("button");
      if (!trigger || !button) throw new Error("trigger did not render");
      trigger.getBoundingClientRect = () => rect(300, 100, 40, 20);
      act(() => button.focus());
      const bubble = document.body.querySelector<HTMLElement>('[role="tooltip"]');
      if (!bubble) throw new Error("bubble did not open");
      expect(Number.parseFloat(bubble.style.top)).toBe(270);

      const observer = observers.find((entry) => entry.targets.includes(bubble));
      bubbleHeight = 60;
      act(() => observer?.callback([], observer as unknown as ResizeObserver));
      expect(Number.parseFloat(bubble.style.top)).toBe(234);
    } finally {
      unmount();
      globalThis.ResizeObserver = OriginalResizeObserver;
      if (height) Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
    }
  });
});

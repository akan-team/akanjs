import "../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { PageActivity } from "akanjs/client";
import { act, useState } from "react";
import { mountAsync, setTestEnv } from "./testHelpers.fixture";

let BottomSheet: typeof import("./BottomSheet").BottomSheet;
let DefaultDropdown: typeof import("./Dropdown").DefaultDropdown;
let pageActivityContext: typeof import("akanjs/client").pageActivityContext;

beforeAll(async () => {
  setTestEnv("bottomsheettest");
  ({ BottomSheet } = await import("./BottomSheet"));
  ({ DefaultDropdown } = await import("./Dropdown"));
  ({ pageActivityContext } = await import("akanjs/client"));
});

const settle = async () => {
  for (let i = 0; i < 5; i += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

//? The spring runs on animation frames, so its result lands in real time, not in a few turns of the event loop.
const springTo = async (done: () => boolean) => {
  for (let elapsed = 0; elapsed < 3000 && !done(); elapsed += 16)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });
};

const panelHolding = (text: string) => {
  const body = [...document.body.querySelectorAll("p")].find((node) => node.textContent === text);
  const panel = body?.closest<HTMLElement>(".bg-card");
  if (!panel) throw new Error("sheet did not render");
  return panel;
};

describe("BottomSheet", () => {
  test("a closed sheet reports no dismissal when it mounts", async () => {
    const onCancel = mock(() => undefined);
    const { unmount } = await mountAsync(
      <BottomSheet type="half" open={false} onCancel={onCancel}>
        <p>body</p>
      </BottomSheet>,
    );
    await settle();

    expect(onCancel).not.toHaveBeenCalled();
    unmount();
  });

  test("an open sheet sits on the overlay layer, locks the page, and reports one dismissal from the backdrop", async () => {
    const onCancel = mock(() => undefined);
    const { container, unmount } = await mountAsync(
      <BottomSheet type="half" open onCancel={onCancel}>
        <p>sheet body</p>
      </BottomSheet>,
    );
    await settle();

    const backdrop = [...document.body.querySelectorAll<HTMLElement>(".backdrop-blur-sm")].at(-1);
    expect(container.textContent).not.toContain("sheet body");
    expect(document.body.textContent).toContain("sheet body");
    expect(document.body.style.overflow).toBe("hidden");
    act(() => backdrop?.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("a sheet that never opened is parked one full height below the edge and hidden, whatever the viewport", async () => {
    const { unmount } = await mountAsync(
      <BottomSheet type="full" open={false}>
        <p>parked body</p>
      </BottomSheet>,
    );
    await settle();

    const panel = panelHolding("parked body");
    expect(panel.style.transform).toContain("translateY(100%)");
    expect(panel.style.visibility).toBe("hidden");
    unmount();
  });

  test("a sheet opened from its trigger shows, and once dismissed slides back to its parked, hidden place", async () => {
    const { container, unmount } = await mountAsync(
      <BottomSheet type="half" trigger={<button type="button">Filter</button>}>
        <p>cycle body</p>
      </BottomSheet>,
    );
    try {
      await settle();
      const panel = panelHolding("cycle body");
      act(() => container.querySelector("button")?.click());
      await springTo(() => panel.style.transform === "none");
      expect(panel.style.visibility).toBe("inherit");

      const backdrop = [...document.body.querySelectorAll<HTMLElement>(".backdrop-blur-sm")].at(-1);
      act(() => backdrop?.click());
      await springTo(() => panel.style.visibility === "hidden");
      expect(panel.style.transform).toContain("translateY(100%)");
      expect(panel.style.visibility).toBe("hidden");
    } finally {
      unmount();
    }
  });

  test("an overlay opened inside the sheet lands in the sheet's own layer, above the panel, not under it on <body>", async () => {
    const { unmount } = await mountAsync(
      <BottomSheet type="half" open>
        <p>menu body</p>
        <DefaultDropdown value="More" content={<li>Edit</li>} />
      </BottomSheet>,
    );
    try {
      await settle();
      const panel = panelHolding("menu body");
      const layer = panel.parentElement;
      const menu = [...document.querySelectorAll("ul")].at(-1);
      expect(layer?.parentElement).toBe(document.body);
      expect(menu?.parentElement).toBe(layer);
      expect(panel.contains(menu ?? null)).toBe(false);
      expect(panel.style.zIndex).toBe("");
      expect(Number(menu?.style.zIndex)).toBeGreaterThan(0);
    } finally {
      unmount();
    }
  });

  test("a drag-dismiss the controlled parent declines springs the sheet back instead of leaving it half-dragged", async () => {
    const onCancel = mock(() => undefined);
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
    const { unmount } = await mountAsync(
      <BottomSheet type="half" open onCancel={onCancel}>
        <p>drag body</p>
      </BottomSheet>,
    );
    try {
      await settle();
      const panel = panelHolding("drag body");
      await springTo(() => panel.style.transform === "none");
      const grip = panel.querySelector(".cursor-grab");
      if (!grip) throw new Error("drag handle did not render");
      const pointer = (type: string, clientY: number, buttons: number) =>
        new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: "mouse", buttons, clientX: 0, clientY });

      act(() => {
        grip.dispatchEvent(pointer("pointerdown", 0, 1));
        grip.dispatchEvent(pointer("pointermove", 300, 1));
      });
      await springTo(() => panel.style.transform.includes("translateY(50%)"));
      expect(panel.style.transform).toContain("translateY(50%)");

      act(() => {
        grip.dispatchEvent(pointer("pointerup", 300, 0));
      });
      await springTo(() => panel.style.transform === "none");
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(panel.style.transform).toBe("none");
    } finally {
      unmount();
      if (height) Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
    }
  });

  test("an open sheet on a page the CSR stack moved off is hidden and lets go of the page, without a dismissal", async () => {
    const onCancel = mock(() => undefined);
    let setPageActivity: ((activity: PageActivity) => void) | undefined;
    const Stacked = () => {
      const [activity, setActivity] = useState<PageActivity>("current");
      setPageActivity = setActivity;
      return (
        <pageActivityContext.Provider value={{ activity, focused: activity === "current" }}>
          <BottomSheet type="half" open onCancel={onCancel}>
            <p>stacked body</p>
          </BottomSheet>
        </pageActivityContext.Provider>
      );
    };
    const { unmount } = await mountAsync(<Stacked />);
    try {
      await settle();
      const layer = panelHolding("stacked body").parentElement;
      expect(layer?.style.visibility).toBe("");
      expect(document.body.style.overflow).toBe("hidden");

      act(() => setPageActivity?.("prev"));
      expect(layer?.style.visibility).toBe("hidden");
      expect(document.body.style.overflow).toBe("");
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      expect(onCancel).not.toHaveBeenCalled();

      act(() => setPageActivity?.("current"));
      expect(layer?.style.visibility).toBe("");
      expect(document.body.style.overflow).toBe("hidden");
    } finally {
      unmount();
    }
  });
});

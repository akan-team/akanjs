import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { AgenticSurface, AgentProvider } from "use-agentic";
import { l, mountAsync, setTestEnv } from "../testHelpers.fixture";

let Dialog: typeof import("./index").Dialog;
let DefaultDropdown: typeof import("../Dropdown").DefaultDropdown;

beforeAll(async () => {
  setTestEnv("dialogtest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }), fetch: {} } as never);
  ({ Dialog } = await import("./index"));
  ({ DefaultDropdown } = await import("../Dropdown"));
});

const settle = async () => {
  for (let i = 0; i < 40; i += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

describe("Dialog agent surface", () => {
  test("the agent's close takes the same path the X button takes, so onCancel still runs", async () => {
    const surface = new AgenticSurface();
    const onCancel = mock(() => undefined);
    const { unmount } = await mountAsync(
      <AgentProvider surface={surface}>
        <Dialog namespace="review" defaultOpen>
          <Dialog.Modal onCancel={onCancel}>
            <div>body</div>
          </Dialog.Modal>
        </Dialog>
      </AgentProvider>,
    );

    expect(surface.read("dialogInReview")).toBe(true);
    await act(async () => {
      await surface.call("closeDialogInReview", {});
    });
    await settle();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(surface.read("dialogInReview")).toBe(false);
    unmount();
  });

  test("a dialog that guards its dismissal guards it against the agent too", async () => {
    const surface = new AgenticSurface();
    const onCancel = mock(() => undefined);
    const confirm = mock(() => false);
    const original = window.confirm;
    window.confirm = confirm as unknown as typeof window.confirm;
    try {
      const { unmount } = await mountAsync(
        <AgentProvider surface={surface}>
          <Dialog namespace="review" defaultOpen>
            <Dialog.Modal onCancel={onCancel} confirmClose>
              <div>body</div>
            </Dialog.Modal>
          </Dialog>
        </AgentProvider>,
      );

      await act(async () => {
        await surface.call("closeDialogInReview", {});
      });
      await settle();

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
      expect(surface.read("dialogInReview")).toBe(true);
      unmount();
    } finally {
      window.confirm = original;
    }
  });
});

describe("Dialog stacking", () => {
  const modalRoot = (panel: Element | null | undefined) => {
    const root = panel?.parentElement;
    if (!(root instanceof HTMLElement)) throw new Error("modal did not render");
    return root;
  };

  test("a dropdown on the page sits under an open modal", async () => {
    const { unmount } = await mountAsync(
      <>
        <DefaultDropdown value="More" content={<li>Edit</li>} />
        <Dialog defaultOpen>
          <Dialog.Modal>
            <div>body</div>
          </Dialog.Modal>
        </Dialog>
      </>,
    );
    await settle();

    const menu = document.querySelector("ul");
    const root = modalRoot(document.querySelector('[role="dialog"]'));
    expect(menu?.parentElement).toBe(document.body);
    expect(Number(menu?.style.zIndex)).toBeLessThan(Number(root.style.zIndex));
    unmount();
  });

  test("a dropdown inside a modal portals into the modal's root, beside the panel that would clip it", async () => {
    const { unmount } = await mountAsync(
      <Dialog defaultOpen>
        <Dialog.Modal>
          <DefaultDropdown value="More" content={<li>Edit</li>} />
        </Dialog.Modal>
      </Dialog>,
    );
    await settle();

    const panel = document.querySelector('[role="dialog"]');
    const menu = document.querySelector("ul");
    expect(menu?.parentElement).toBe(modalRoot(panel));
    expect(panel?.contains(menu ?? null)).toBe(false);
    unmount();
  });

  test("a modal opened inside a modal lands in its parent's root, so it stacks above it whatever the DOM order", async () => {
    const { unmount } = await mountAsync(
      <Dialog defaultOpen>
        <Dialog.Modal>
          <Dialog defaultOpen>
            <Dialog.Modal>
              <div>inner</div>
            </Dialog.Modal>
          </Dialog>
        </Dialog.Modal>
      </Dialog>,
    );
    await settle();

    const [outer, inner] = [...document.querySelectorAll('[role="dialog"]')];
    expect(modalRoot(inner).parentElement).toBe(modalRoot(outer));
    unmount();
  });
});

describe("Dialog presentation", () => {
  const panelOf = () => {
    const panel = document.querySelector('[role="dialog"]');
    if (!(panel instanceof HTMLElement)) throw new Error("modal did not render");
    return panel;
  };

  test("a dialog keeps its centred box and draws no drag handle", async () => {
    const { unmount } = await mountAsync(
      <Dialog defaultOpen>
        <Dialog.Modal>
          <div>body</div>
        </Dialog.Modal>
      </Dialog>,
    );
    await settle();

    expect(panelOf().className).toContain("max-w-2xl");
    expect(panelOf().querySelector(".touch-none")).toBeNull();
    unmount();
  });

  test("auto is a full-screen sheet with a handle below md, and right is a side sheet from md up", async () => {
    const { unmount } = await mountAsync(
      <Dialog defaultOpen>
        <Dialog.Modal presentation="auto" placement="right">
          <div>body</div>
        </Dialog.Modal>
      </Dialog>,
    );
    await settle();

    const panel = panelOf();
    expect(panel.className).toContain("h-full");
    expect(panel.className).toContain("pt-[max(var(--akan-top-safe-area,0px),env(safe-area-inset-top,0px))]");
    expect(panel.className).toContain("md:max-w-md");
    expect(panel.parentElement?.className).toContain("md:justify-end");
    expect(panel.querySelector(".touch-none")?.className).toContain("md:hidden");
    unmount();
  });

  test("a sheet follows a drag down its handle, and dismisses only past its threshold", async () => {
    const onCancel = mock(() => undefined);
    const media = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
    const { unmount } = await mountAsync(
      <Dialog defaultOpen>
        <Dialog.Modal presentation="sheet" onCancel={onCancel}>
          <div>body</div>
        </Dialog.Modal>
      </Dialog>,
    );
    try {
      await settle();
      const handle = panelOf().querySelector(".touch-none");
      if (!handle) throw new Error("drag handle did not render");
      const pointer = (type: string, clientY: number, buttons: number) =>
        new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: "mouse", buttons, clientX: 0, clientY });
      const slowDragTo = async (clientY: number) => {
        act(() => void handle.dispatchEvent(pointer("pointerdown", 0, 1)));
        for (let y = 20; y <= clientY; y += 20) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          act(() => void handle.dispatchEvent(pointer("pointermove", y, 1)));
        }
      };

      await slowDragTo(100);
      expect(Number(/translateY\((\d+)px\)/.exec(panelOf().style.transform)?.[1])).toBeGreaterThan(90);
      await new Promise((resolve) => setTimeout(resolve, 80));
      act(() => void handle.dispatchEvent(pointer("pointerup", 100, 0)));
      expect(onCancel).not.toHaveBeenCalled();
      expect(panelOf().style.transform).toBe("");

      await slowDragTo(140);
      await new Promise((resolve) => setTimeout(resolve, 80));
      act(() => void handle.dispatchEvent(pointer("pointerup", 140, 0)));
      expect(onCancel).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      if (media) Object.defineProperty(window, "matchMedia", media);
      else Reflect.deleteProperty(window, "matchMedia");
    }
  });

  test("a legacy modal cuts a slow drag short and springs back, and dismisses one past half its height", async () => {
    const onCancel = mock(() => undefined);
    const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    let height = 600;
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => height });
    const { unmount } = await mountAsync(
      <Dialog defaultOpen>
        <Dialog.LegacyModal onCancel={onCancel}>
          <div>body</div>
        </Dialog.LegacyModal>
      </Dialog>,
    );
    try {
      await settle();
      const grip = panelOf().querySelector(".touch-pan-y");
      if (!grip) throw new Error("drag header did not render");
      const pointer = (type: string, clientY: number, buttons: number) =>
        new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: "mouse", buttons, clientX: 0, clientY });
      const slowDrag = async (to: number) => {
        act(() => void grip.dispatchEvent(pointer("pointerdown", 0, 1)));
        for (let y = 20; y <= to; y += 20) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          act(() => void grip.dispatchEvent(pointer("pointermove", y, 1)));
        }
        await new Promise((resolve) => setTimeout(resolve, 80));
        act(() => void grip.dispatchEvent(pointer("pointerup", to, 0)));
        await settle();
      };

      await slowDrag(200);
      expect(onCancel).not.toHaveBeenCalled();

      height = 100;
      await slowDrag(60);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await settle();
      expect(onCancel).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      if (clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
    }
  });
});

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

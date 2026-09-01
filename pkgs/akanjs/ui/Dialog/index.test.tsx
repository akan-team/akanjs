import "../../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AgenticSurface, AgentProvider } from "use-agentic";

let Dialog: typeof import("./index").Dialog;

const l = Object.assign((key: string) => key, {
  _: (key: string) => key,
  rich: (key: string) => key,
  trans: (translation: Record<string, string>) => translation.en,
});

/** Imported after the environment is set: `akanjs/store`'s baseSt reads the env while the module evaluates. */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "dialogtest";
  process.env.AKAN_PUBLIC_REPO_NAME = "dialogtest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }), fetch: {} } as never);
  ({ Dialog } = await import("./index"));
});

const settle = async () => {
  for (let i = 0; i < 40; i += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, unmount: () => act(() => root.unmount()) };
};

describe("Dialog agent surface", () => {
  test("the agent's close takes the same path the X button takes, so onCancel still runs", async () => {
    const surface = new AgenticSurface();
    const onCancel = mock(() => undefined);
    const { unmount } = await mount(
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
      const { unmount } = await mount(
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

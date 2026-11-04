import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { l, mountAsync, setTestEnv } from "../testHelpers.fixture";
import { type AkanUiOverrides, UiOverrideProvider } from "../UiOverride";

let Messages: typeof import("./Messages").Messages;
let st: typeof import("akanjs/store").st;

beforeAll(async () => {
  setTestEnv("messagestest");
  const { registerClientRuntime } = await import("akanjs/client");
  // `msg` is a proxy over the runtime: the shell assigns the real `msg.*` onto it, so the stub needs the target.
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }), fetch: {}, msg: {} } as never);
  ({ Messages } = await import("./Messages"));
  ({ st } = await import("akanjs/store"));
});

const mount = async (children = <Messages />) => (await mountAsync(children)).unmount;

const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

const stateOf = (text: string) =>
  [...document.querySelectorAll("[data-state]")]
    .find((card) => card.textContent?.includes(text))
    ?.getAttribute("data-state");

describe("Messages", () => {
  test("shows a message through the framework toast and drops it once its exit ends", async () => {
    const unmount = await mount();
    await act(async () => st.do.showMessage({ content: "SAVED", duration: 0.05 }));
    const toast = document.querySelector("#toast");
    expect(toast?.textContent).toContain("SAVED");
    expect(document.querySelector('[data-state="in"]')).not.toBeNull();

    await wait(80);
    const leaving = document.querySelector('[data-state="out"]');
    expect(leaving).not.toBeNull();
    expect(st.get().messages).toHaveLength(1);

    // The default card drops the message when its leave animation ends; happy-dom runs no CSS animation.
    await act(async () => leaving?.dispatchEvent(new Event("animationend", { bubbles: true })));
    expect(st.get().messages).toHaveLength(0);
    expect(document.querySelector("#toast")).toBeNull();
    unmount();
  });

  test("dismisses a message a replacement never finishes, so a skin without an exit animation cannot stick", async () => {
    const BareToast: AkanUiOverrides["Toast"] = ({ messages }) => (
      <div data-slot="bare-toast">{messages.map((message) => message.content)}</div>
    );
    const unmount = await mount(
      <UiOverrideProvider value={{ Toast: BareToast }}>
        <Messages />
      </UiOverrideProvider>,
    );
    await act(async () => st.do.showMessage({ content: "SKINNED", duration: 0.05 }));
    expect(document.querySelector('[data-slot="bare-toast"]')?.textContent).toContain("SKINNED");
    expect(document.querySelector("#toast")).toBeNull();

    await wait(2200);
    expect(st.get().messages).toHaveLength(0);
    unmount();
  }, 10_000);

  test("keeps a running countdown when another message arrives", async () => {
    const unmount = await mount();
    await act(async () => st.do.showMessage({ key: "first", content: "FIRST", duration: 0.2 }));
    await wait(150);
    await act(async () => st.do.showMessage({ key: "second", content: "SECOND", duration: 0.2 }));
    await wait(100);
    // The first message's 200ms elapsed while the second was still counting: a re-armed timer would have
    // restarted it and left both on screen.
    expect(document.querySelector('[data-state="out"]')?.textContent).toContain("FIRST");
    expect(document.querySelector('[data-state="in"]')?.textContent).toContain("SECOND");
    unmount();
  });

  test("keeps a message with a duration of 0 until one with its key replaces it", async () => {
    const unmount = await mount();
    await act(async () => st.do.showMessage({ key: "upload", type: "loading", content: "UPLOADING", duration: 0 }));
    await wait(100);
    expect(stateOf("UPLOADING")).toBe("in");

    await act(async () => st.do.showMessage({ key: "upload", type: "success", content: "UPLOADED", duration: 0.05 }));
    expect(stateOf("UPLOADING")).toBeUndefined();
    expect(stateOf("UPLOADED")).toBe("in");
    await wait(80);
    expect(stateOf("UPLOADED")).toBe("out");
    unmount();
  });
});

import "../../test/registerDom";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { act, useState } from "react";
import { l, mountAsync, setTestEnv } from "../testHelpers.fixture";

interface DragOptions {
  onDrag: (y: number, height: number) => void;
  onRelease: (release: { dismiss: boolean; velocity: number; height: number; canceled: boolean }) => void;
}
const held: { drag: DragOptions | null; setOpen: ((open: boolean) => void) | null } = { drag: null, setOpen: null };
mock.module("../useDismissDrag", () => ({
  useDismissDrag: (options: DragOptions) => {
    held.drag = options;
    return { bind: () => ({}), driver: null };
  },
}));

let Dialog: typeof import("./index").Dialog;

beforeAll(async () => {
  setTestEnv("modalleavetest");
  const { registerClientRuntime } = await import("akanjs/client");
  registerClientRuntime({ usePage: () => ({ path: "/", lang: "en", l }), fetch: {} } as never);
  ({ Dialog } = await import("./index"));
});

const original = HTMLElement.prototype.getAnimations;
afterEach(() => {
  HTMLElement.prototype.getAnimations = original;
});

const Sheet = () => {
  const [open, setOpen] = useState(true);
  held.setOpen = setOpen;
  return (
    <Dialog open={open}>
      <Dialog.Modal onCancel={() => setOpen(false)}>
        <div>body</div>
      </Dialog.Modal>
    </Dialog>
  );
};

const panel = () => document.querySelector<HTMLElement>('[role="dialog"]');

describe("Dialog.Modal while it leaves", () => {
  test("a sheet dragged shut and opened again before its leave ends is back in place", async () => {
    const { unmount } = await mountAsync(<Sheet />);
    const leave = { playState: "running", finished: new Promise<void>(() => undefined) };
    HTMLElement.prototype.getAnimations = () =>
      [{ ...leave, effect: { getComputedTiming: () => ({ endTime: 260 }) } }] as unknown as Animation[];

    act(() => held.drag?.onDrag(200, 600));
    expect(panel()?.style.transform).toBe("translateY(200px)");

    act(() => held.drag?.onRelease({ dismiss: true, velocity: 0, height: 600, canceled: false }));
    expect(panel()?.hasAttribute("data-leaving")).toBe(true);
    expect(panel()?.style.transform).toBe("translateY(200px)");

    act(() => held.setOpen?.(true));
    expect(panel()?.hasAttribute("data-leaving")).toBe(false);
    expect(panel()?.style.transform).toBe("");
    unmount();
  });
});

import "../test/registerDom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactNode, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useLeave } from "./useLeave";

const Overlay = ({ open }: { open: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { drawn, leaving } = useLeave(open, ref);
  if (!drawn) return null;
  return <div ref={ref} data-testid="overlay" data-leaving={leaving ? "" : undefined} />;
};

const animationOf = (playState: AnimationPlayState, endTime: number) => {
  const { promise: finished, resolve: finish } = Promise.withResolvers<void>();
  return { animation: { playState, finished, effect: { getComputedTiming: () => ({ endTime }) } }, finish };
};

const original = HTMLElement.prototype.getAnimations;
const animate = (animations: unknown[]) => {
  HTMLElement.prototype.getAnimations = () => animations as Animation[];
};
afterEach(() => {
  HTMLElement.prototype.getAnimations = original;
});

const mount = (node: ReactNode) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(node));
  return { container, rerender: (next: ReactNode) => root.render(next), unmount: () => act(() => root.unmount()) };
};

const overlay = (container: HTMLElement) => container.querySelector("[data-testid=overlay]");

describe("useLeave", () => {
  test("a close with no leave animation unmounts at once", () => {
    const { container, rerender, unmount } = mount(<Overlay open />);
    act(() => rerender(<Overlay open={false} />));
    expect(overlay(container)).toBeNull();
    unmount();
  });

  test("a close stays drawn and marked leaving until its leave animation ends", async () => {
    const { container, rerender, unmount } = mount(<Overlay open />);
    const { animation, finish } = animationOf("running", 240);
    animate([animation]);
    act(() => rerender(<Overlay open={false} />));
    expect(overlay(container)?.hasAttribute("data-leaving")).toBe(true);

    await act(async () => finish());
    expect(overlay(container)).toBeNull();
    unmount();
  });

  test("an entrance that already played and an endless animation inside hold nothing", () => {
    const { container, rerender, unmount } = mount(<Overlay open />);
    animate([animationOf("finished", 240).animation, animationOf("running", Number.POSITIVE_INFINITY).animation]);
    act(() => rerender(<Overlay open={false} />));
    expect(overlay(container)).toBeNull();
    unmount();
  });

  test("opened again while it leaves, it stays and is no longer leaving", () => {
    const { container, rerender, unmount } = mount(<Overlay open />);
    animate([animationOf("running", 240).animation]);
    act(() => rerender(<Overlay open={false} />));
    act(() => rerender(<Overlay open />));
    expect(overlay(container)?.hasAttribute("data-leaving")).toBe(false);
    unmount();
  });
});

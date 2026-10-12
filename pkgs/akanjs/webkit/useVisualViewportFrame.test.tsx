import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useVisualViewportFrame, type VisualViewportFrame } from "./useVisualViewportFrame";

class FakeVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
  scale = 1;
}

describe("useVisualViewportFrame", () => {
  test("reports the keyboard over the layout viewport's bottom, and ignores a pinch zoom", () => {
    const viewport = new FakeVisualViewport();
    Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    let frame: VisualViewportFrame | undefined;
    const Probe = () => {
      frame = useVisualViewportFrame();
      return null;
    };
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));
    expect(frame?.keyboardHeight).toBe(0);

    act(() => {
      viewport.height = 450;
      viewport.offsetTop = 50;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(frame).toEqual({ keyboardHeight: 300, height: 450, offsetTop: 50 });

    act(() => {
      viewport.scale = 2;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(frame?.keyboardHeight).toBe(0);
    act(() => root.unmount());
  });
});

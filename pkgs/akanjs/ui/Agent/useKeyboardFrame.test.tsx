import "../../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { act, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { setTestEnv } from "../testHelpers.fixture";

let useKeyboardFrame: typeof import("./useKeyboardFrame").useKeyboardFrame;

beforeAll(async () => {
  setTestEnv("keyboardframetest");
  ({ useKeyboardFrame } = await import("./useKeyboardFrame"));
});

class FakeVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
  scale = 1;
}

const mountFrame = ({ fullScreen }: { fullScreen: boolean }) => {
  const viewport = new FakeVisualViewport();
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  Object.defineProperty(window, "matchMedia", { value: () => ({ matches: fullScreen }), configurable: true });
  const seen: { frame?: CSSProperties } = {};
  const Probe = () => {
    seen.frame = useKeyboardFrame();
    return null;
  };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  const move = (height: number, offsetTop: number) =>
    act(() => {
      viewport.height = height;
      viewport.offsetTop = offsetTop;
      viewport.dispatchEvent(new Event("resize"));
    });
  return { seen, move, unmount: () => act(() => root.unmount()) };
};

describe("useKeyboardFrame", () => {
  test("pins a full-screen panel to the visible rectangle while iOS pans it to the field", () => {
    const { seen, move, unmount } = mountFrame({ fullScreen: true });
    expect(seen.frame).toBeUndefined();

    move(450, 350);
    expect(seen.frame).toEqual({ top: 350, bottom: "auto", height: 450 });

    move(450, 0);
    expect(seen.frame).toEqual({ top: 0, bottom: "auto", height: 450 });

    move(800, 0);
    expect(seen.frame).toBeUndefined();
    unmount();
  });

  test("insets a floating panel by the keyboard over the layout viewport's bottom", () => {
    const { seen, move, unmount } = mountFrame({ fullScreen: false });
    move(500, 0);
    expect(seen.frame).toEqual({ paddingBottom: 300 });

    move(800, 0);
    expect(seen.frame).toBeUndefined();
    unmount();
  });
});

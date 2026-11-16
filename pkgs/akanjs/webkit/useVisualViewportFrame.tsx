"use client";
import { Device } from "akanjs/client";
import { useEffect, useState } from "react";

export interface VisualViewportFrame {
  /** The on-screen keyboard's height over the layout viewport's bottom; 0 while it is closed. */
  keyboardHeight: number;
  /** The visible rectangle's height and its scroll offset from the layout viewport's top, in CSS px. */
  height: number;
  offsetTop: number;
}

/** Whether the iOS shell left the keyboard to the page; an older shell still pans to the field, so the page must not. */
export const isPageKeyboardAvoidance = () =>
  (globalThis as { __AKAN_NATIVE__?: { keyboardAvoidance?: string } }).__AKAN_NATIVE__?.keyboardAvoidance === "page";

const currentDevice = () => {
  try {
    return Device.getDevice();
  } catch {
    return null;
  }
};

const closedFrame = (): VisualViewportFrame => ({
  keyboardHeight: 0,
  height: typeof window === "undefined" ? 0 : window.innerHeight,
  offsetTop: 0,
});

/**
 * The visible part of the page while the on-screen keyboard is up, on the web. Only `visualViewport` reports the
 * keyboard: `dvh` tracks the browser's own chrome, and iOS pans the visual viewport to the field instead of shrinking
 * the page, so a fixed bottom bar stays behind the keyboard until it is placed at `offsetTop + height`.
 */
export const useVisualViewportFrame = (): VisualViewportFrame => {
  const [frame, setFrame] = useState<VisualViewportFrame>(closedFrame);
  useEffect(() => {
    //? An iOS shell that left the keyboard to the page keeps the visual viewport whole; its keyboard plugin says what
    //? the keys cover, so the visible part is the window above them.
    if (isPageKeyboardAvoidance()) {
      const device = currentDevice();
      if (!device) return;
      const apply = (keyboardHeight: number) =>
        setFrame(
          keyboardHeight > 0
            ? { keyboardHeight, height: window.innerHeight - keyboardHeight, offsetTop: 0 }
            : closedFrame(),
        );
      apply(device.keyboardHeight);
      return device.subscribeKeyboard(apply);
    }
    const viewport = window.visualViewport;
    if (!viewport) return;
    const measure = () => {
      // A pinch zoom shrinks the visual viewport too, and chasing it would drag bars around under the fingers.
      const zoomed = viewport.scale > 1.01;
      const keyboardHeight = zoomed
        ? 0
        : Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      const next = zoomed
        ? closedFrame()
        : { keyboardHeight, height: Math.round(viewport.height), offsetTop: Math.round(viewport.offsetTop) };
      setFrame((prev) =>
        prev.keyboardHeight === next.keyboardHeight && prev.height === next.height && prev.offsetTop === next.offsetTop
          ? prev
          : next,
      );
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);
  return frame;
};

"use client";
import { csrLocation, debugFrame } from "akanjs/client";
import { useEffect } from "react";
import type { CsrKeyboard } from "./useCsrKeyboard";
import type { CsrLocationState } from "./useCsrLocationState";
import type { CsrRefs } from "./useCsrRefs";
import type { useFrameSlots, useFrameViewport } from "./useFrameRuntime";
import type { ResolvedFrame } from "./useResolvedFrame";

export const useCsrRenderTrace = ({
  viewport,
  frameSlots,
  refs: { renderCountRef },
  nav: { getCurrentLocation },
  frame: { resolvedLocation },
  keyboard: { keyboardFrame, keyboardLayout, accessoryHeight, platformProfile },
}: {
  viewport: ReturnType<typeof useFrameViewport>["viewport"];
  frameSlots: ReturnType<typeof useFrameSlots>["frameSlots"];
  refs: CsrRefs;
  nav: CsrLocationState;
  frame: ResolvedFrame;
  keyboard: CsrKeyboard;
}) => {
  renderCountRef.current += 1;
  if (renderCountRef.current <= 5 || renderCountRef.current % 20 === 0) {
    debugFrame("csr.render", {
      count: renderCountRef.current,
      path: resolvedLocation.pathRoute.path,
      href: resolvedLocation.href,
      viewport,
      keyboardFrame,
      contentViewport: keyboardLayout.contentViewport,
      keyboardAccessory: keyboardLayout.keyboardAccessory,
      frameSlotPaths: Object.keys(frameSlots),
    });
  }
  useEffect(() => {
    debugFrame("keyboard.layoutResolve", {
      path: resolvedLocation.pathRoute.path,
      keyboardHeight: keyboardFrame.height,
      visualHeight: viewport.visualHeight,
      visualOffsetTop: viewport.visualOffsetTop,
      contentViewport: keyboardLayout.contentViewport,
      accessory: keyboardLayout.keyboardAccessory,
      slotHeight: accessoryHeight,
      platformProfile,
      frozen: keyboardFrame.frozen,
      source: keyboardFrame.source,
    });
  }, [
    resolvedLocation.pathRoute.path,
    keyboardFrame.height,
    keyboardFrame.offset,
    keyboardFrame.frozen,
    keyboardFrame.source,
    viewport.visualHeight,
    viewport.visualOffsetTop,
    keyboardLayout,
    accessoryHeight,
    platformProfile,
  ]);
  useEffect(() => {
    debugFrame("csr.mount", { path: resolvedLocation.pathRoute.path, viewport });
    csrLocation.replace({ ...((csrLocation.state as object | null) ?? {}), akanEntryId: getCurrentLocation().entryId });
    return () => debugFrame("csr.unmount", { lastPath: getCurrentLocation().pathRoute.path });
  }, []);
};

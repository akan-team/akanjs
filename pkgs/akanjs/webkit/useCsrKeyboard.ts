"use client";
import { debugFrame, type KeyboardFrameState } from "akanjs/client";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { CsrLocationState } from "./useCsrLocationState";
import type { CsrRefs } from "./useCsrRefs";
import {
  getFramePlatformProfile,
  hasBottomAnchoredKeyboardSlot,
  hasKeyboardStickySlot,
  resolveKeyboardAccessoryHeight,
  resolveKeyboardLayout,
  useFrameRuntimeResync,
  type useFrameSlots,
  type useFrameViewport,
  useKeyboardFrame,
} from "./useFrameRuntime";
import type { ResolvedFrame } from "./useResolvedFrame";

export const useCsrKeyboard = ({
  viewport,
  updateViewport,
  frameSlots,
  phase,
  resolvedLocation,
  pageContentRef,
}: {
  viewport: ReturnType<typeof useFrameViewport>["viewport"];
  updateViewport: ReturnType<typeof useFrameViewport>["updateViewport"];
  frameSlots: ReturnType<typeof useFrameSlots>["frameSlots"];
  phase: CsrLocationState["phase"];
  resolvedLocation: ResolvedFrame["resolvedLocation"];
  pageContentRef: CsrRefs["pageContentRef"];
}) => {
  const platformProfile = getFramePlatformProfile();
  const accessoryHeight = resolveKeyboardAccessoryHeight(resolvedLocation.pathRoute.path, frameSlots);
  const shouldAnchorContentBottom = hasBottomAnchoredKeyboardSlot(resolvedLocation.pathRoute.path, frameSlots);
  const keyboardFrame = useKeyboardFrame({
    bottomSafeArea: resolvedLocation.pathRoute.pageState.bottomSafeArea,
    sticky: hasKeyboardStickySlot(resolvedLocation.pathRoute.path, frameSlots),
    viewport,
    platformProfile,
    freeze: phase === "transitioning",
  });
  const keyboardLayout = useMemo(
    () =>
      resolveKeyboardLayout({
        viewport,
        keyboard: keyboardFrame,
        accessoryHeight,
        bottomSafeArea: resolvedLocation.pathRoute.pageState.bottomSafeArea,
      }),
    [viewport, keyboardFrame, accessoryHeight, resolvedLocation.pathRoute.pageState.bottomSafeArea],
  );
  const contentBottomAnchorRef = useRef<{
    path: string;
    contentViewportHeight: number;
    bottomDistance: number;
  } | null>(null);
  const contentBottomAnchorRafRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const element = pageContentRef.current;
    const path = resolvedLocation.pathRoute.path;
    if (!element || !shouldAnchorContentBottom || !keyboardFrame.sticky) {
      contentBottomAnchorRef.current = null;
      if (contentBottomAnchorRafRef.current !== null) {
        cancelAnimationFrame(contentBottomAnchorRafRef.current);
        contentBottomAnchorRafRef.current = null;
      }
      return;
    }

    const previous = contentBottomAnchorRef.current;
    const currentBottomDistance = Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight);
    if (!previous || previous.path !== path) {
      contentBottomAnchorRef.current = {
        path,
        contentViewportHeight: keyboardLayout.contentViewport.height,
        bottomDistance: currentBottomDistance,
      };
      return;
    }

    const shouldRestoreBottom = previous.contentViewportHeight !== keyboardLayout.contentViewport.height;
    const bottomDistance = previous.bottomDistance;
    if (shouldRestoreBottom) {
      const nextScrollTop = Math.max(0, element.scrollHeight - element.clientHeight - bottomDistance);
      if (Math.abs(element.scrollTop - nextScrollTop) > 1) {
        debugFrame("keyboard.contentAnchor", {
          path,
          from: element.scrollTop,
          to: nextScrollTop,
          bottomDistance,
          contentViewportHeight: keyboardLayout.contentViewport.height,
        });
        element.scrollTop = nextScrollTop;
      }
      const startedAt = performance.now();
      const duration = (keyboardFrame.animationDuration ?? 0) + 50;
      const keepBottomAnchored = () => {
        const scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - bottomDistance);
        if (Math.abs(element.scrollTop - scrollTop) > 1) element.scrollTop = scrollTop;
        if (performance.now() - startedAt < duration) {
          contentBottomAnchorRafRef.current = requestAnimationFrame(keepBottomAnchored);
        } else {
          contentBottomAnchorRafRef.current = null;
        }
      };
      if (contentBottomAnchorRafRef.current !== null) cancelAnimationFrame(contentBottomAnchorRafRef.current);
      contentBottomAnchorRafRef.current = requestAnimationFrame(keepBottomAnchored);
    }

    contentBottomAnchorRef.current = {
      path,
      contentViewportHeight: keyboardLayout.contentViewport.height,
      bottomDistance: Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight),
    };
    return () => {
      if (contentBottomAnchorRafRef.current !== null) {
        cancelAnimationFrame(contentBottomAnchorRafRef.current);
        contentBottomAnchorRafRef.current = null;
      }
    };
  }, [
    pageContentRef,
    resolvedLocation.pathRoute.path,
    shouldAnchorContentBottom,
    keyboardFrame.sticky,
    keyboardFrame.animationDuration,
    keyboardLayout.contentViewport.height,
  ]);
  useEffect(() => {
    const element = pageContentRef.current;
    const path = resolvedLocation.pathRoute.path;
    if (!element || !shouldAnchorContentBottom || !keyboardFrame.sticky) return;
    const updateBottomDistance = () => {
      contentBottomAnchorRef.current = {
        path,
        contentViewportHeight: keyboardLayout.contentViewport.height,
        bottomDistance: Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight),
      };
    };
    element.addEventListener("scroll", updateBottomDistance, { passive: true });
    return () => element.removeEventListener("scroll", updateBottomDistance);
  }, [
    pageContentRef,
    resolvedLocation.pathRoute.path,
    shouldAnchorContentBottom,
    keyboardFrame.sticky,
    keyboardLayout.contentViewport.height,
  ]);
  useKeyboardRoot(keyboardFrame);
  useRevealCoveredField(pageContentRef, keyboardFrame);
  useFrameRuntimeResync({ updateViewport });
  return { platformProfile, accessoryHeight, shouldAnchorContentBottom, keyboardFrame, keyboardLayout };
};

export type CsrKeyboard = ReturnType<typeof useCsrKeyboard>;

//? On the root, so overlays portalled out of the page can move with the keys too; `Device` sets them itself, sooner,
//? where the iOS shell left the keyboard to the page.
const useKeyboardRoot = (keyboardFrame: KeyboardFrameState) => {
  useLayoutEffect(() => {
    if (keyboardFrame.avoidsContent) return;
    const root = document.documentElement;
    root.style.setProperty("--akan-keyboard-duration", `${keyboardFrame.animationDuration ?? 0}ms`);
    root.style.setProperty("--akan-keyboard-easing", keyboardFrame.animationEasing ?? "ease");
    root.toggleAttribute("data-akan-keyboard", keyboardFrame.visible);
  }, [
    keyboardFrame.avoidsContent,
    keyboardFrame.animationDuration,
    keyboardFrame.animationEasing,
    keyboardFrame.visible,
  ]);
};

//? With the shell's pan gone nothing brings a field the keys cover back into view; the frame does, once they are up.
const useRevealCoveredField = (pageContentRef: CsrRefs["pageContentRef"], keyboardFrame: KeyboardFrameState) => {
  useEffect(() => {
    const element = pageContentRef.current;
    if (!element || !keyboardFrame.avoidsContent || !keyboardFrame.visible) return;
    const timer = window.setTimeout(() => {
      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !element.contains(field)) return;
      const rect = field.getBoundingClientRect();
      if (rect.bottom > element.getBoundingClientRect().bottom || rect.top < 0)
        field.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, keyboardFrame.animationDuration ?? 0);
    return () => window.clearTimeout(timer);
  }, [pageContentRef, keyboardFrame.avoidsContent, keyboardFrame.visible, keyboardFrame.animationDuration]);
};

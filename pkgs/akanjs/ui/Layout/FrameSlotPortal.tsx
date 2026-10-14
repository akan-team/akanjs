"use client";
import { getEnv } from "akanjs/base";
import { cn, useInHiddenLayout, usePathCtx } from "akanjs/client";
import { type ReactNode, useLayoutEffect, useRef } from "react";

import { Portal } from "../Portal";
import {
  type FrameSlotName,
  frameSlotContainerClassNames,
  frameSlotContentClassNames,
  frameSlotStyles,
} from "./frameSlot";

//? The frame's top slots paint after the page and catch its clicks, so while still empty they let this chrome through.
const emptyTopSlotsStepAside =
  "#topInsetContainer:has(> #topInsetContent:empty){background-color:transparent;pointer-events:none}" +
  "#topLeftActionContainer:has(> #topLeftActionContent:empty){pointer-events:none}";

const saveFocusIn = (node: HTMLElement) => {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || !node.contains(focused)) return null;
  const field = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement ? focused : null;
  const start = field?.selectionStart ?? null;
  const end = field?.selectionEnd ?? null;
  const direction = field?.selectionDirection ?? undefined;
  return () => {
    focused.focus({ preventScroll: true });
    if (field && start !== null && end !== null) field.setSelectionRange(start, end, direction);
  };
};

//? `moveBefore` carries focus, the caret and scroll positions across; a plain insert drops focus, so it is put back.
const moveInto = (parent: HTMLElement, node: HTMLElement) => {
  if (node.parentNode === parent) return;
  if (typeof parent.moveBefore === "function" && parent.isConnected && node.isConnected) {
    parent.moveBefore(node, null);
    return;
  }
  const restoreFocus = saveFocusIn(node);
  parent.appendChild(node);
  restoreFocus?.();
};

interface SsrFrameSlotProps {
  slot: FrameSlotName;
  children: ReactNode;
}
//? React neither portals on the server nor hydrates a portal, so the chrome is drawn here in its slot's box, and once
//? hydrated its own DOM moves into the slot: a remount there would drop what was typed into it and where focus was.
const SsrFrameSlot = ({ slot, children }: SsrFrameSlotProps) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    const slotContent = document.getElementById(`${slot}Content`);
    if (!box || !content || !slotContent) return;
    moveInto(slotContent, content);
    return () => moveInto(box, content);
  }, [slot]);
  return (
    <>
      {slot === "topInset" || slot === "topLeftAction" ? <style>{emptyTopSlotsStepAside}</style> : null}
      <div
        ref={boxRef}
        data-akan-frame-fallback={slot}
        className={cn(frameSlotContainerClassNames[slot], "z-10 empty:hidden")}
        style={frameSlotStyles[slot]}
      >
        <div ref={contentRef} className={frameSlotContentClassNames[slot]}>
          {children}
        </div>
      </div>
    </>
  );
};

interface FrameSlotPortalProps {
  slot: FrameSlotName;
  children: ReactNode;
}
export const FrameSlotPortal = ({ slot, children }: FrameSlotPortalProps) => {
  const pathCtx = usePathCtx();
  const isHidden = useInHiddenLayout();
  if (isHidden) return null;
  if (getEnv().renderMode !== "csr") return <SsrFrameSlot slot={slot}>{children}</SsrFrameSlot>;
  //? A CSR frame has no server HTML to keep, and its slots, one set per stacked page, exist before the page renders.
  const path = pathCtx.location?.pathRoute?.path;
  return <Portal id={path ? `${slot}Content-${pathCtx.pageKey ?? path}` : `${slot}Content`}>{children}</Portal>;
};

import type { CSSProperties } from "react";

export type FrameSlotName = "topInset" | "topLeftAction" | "bottomInset" | "keyboardInset";

const topVisibility = "var(--akan-top-inset-visibility, visible)" as CSSProperties["visibility"];
const bottomVisibility = "var(--akan-bottom-inset-visibility, visible)" as CSSProperties["visibility"];
const top: CSSProperties = {
  top: "calc(var(--akan-top-safe-area) + var(--akan-viewport-offset-top, 0px))",
  height: "var(--akan-top-inset)",
  visibility: topVisibility,
};
const bottom: CSSProperties = {
  bottom: "var(--akan-bottom-safe-area)",
  height: "var(--akan-bottom-inset)",
  visibility: bottomVisibility,
};
const keyboard: CSSProperties = {
  bottom: "max(var(--akan-bottom-safe-area), var(--akan-keyboard-inset, 0px))",
  height: "var(--akan-bottom-inset)",
  visibility: bottomVisibility,
};

export const frameSlotStyles: { [slot in FrameSlotName]: CSSProperties } = {
  topInset: top,
  topLeftAction: top,
  bottomInset: bottom,
  keyboardInset: keyboard,
} as const;

export const frameSlotContainerClassNames: { [slot in FrameSlotName]: string } = {
  topInset: "fixed inset-x-0 isolate overflow-hidden bg-background",
  topLeftAction: "fixed left-0 isolate flex aspect-1 items-center justify-center overflow-hidden",
  bottomInset: "pointer-events-none fixed inset-x-0 isolate overflow-hidden",
  keyboardInset: "pointer-events-none fixed inset-x-0 isolate overflow-hidden",
} as const;

export const frameSlotContentClassNames: { [slot in FrameSlotName]: string } = {
  topInset: "relative isolate size-full",
  topLeftAction: "isolate flex size-full items-center justify-center",
  bottomInset: "pointer-events-none isolate size-full",
  keyboardInset: "pointer-events-none isolate size-full",
} as const;

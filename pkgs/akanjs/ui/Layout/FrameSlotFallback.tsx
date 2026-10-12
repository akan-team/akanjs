import { getEnv } from "akanjs/base";
import type { CSSProperties, ReactNode } from "react";

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

const outerClassNames: { [slot in FrameSlotName]: string } = {
  topInset: "fixed inset-x-0 z-10 isolate overflow-hidden bg-background",
  topLeftAction: "fixed left-0 z-10 isolate flex aspect-1 items-center justify-center overflow-hidden",
  bottomInset: "pointer-events-none fixed inset-x-0 z-10 isolate overflow-hidden",
  keyboardInset: "pointer-events-none fixed inset-x-0 z-10 isolate overflow-hidden",
} as const;

const innerClassNames: { [slot in FrameSlotName]: string } = {
  topInset: "relative isolate size-full",
  topLeftAction: "isolate flex size-full items-center justify-center",
  bottomInset: "pointer-events-none isolate size-full",
  keyboardInset: "pointer-events-none isolate size-full",
} as const;

const slotStyles: { [slot in FrameSlotName]: CSSProperties } = {
  topInset: top,
  topLeftAction: top,
  bottomInset: bottom,
  keyboardInset: keyboard,
} as const;

interface FrameSlotFallbackProps {
  slot: FrameSlotName;
  children: ReactNode;
}

/** Chrome drawn in place on the server, in the box its frame slot draws, until the client moves it into that slot. */
export const FrameSlotFallback = ({ slot, children }: FrameSlotFallbackProps) => {
  //? A CSR frame has no server pass, and its slots exist before the first page renders.
  if (getEnv().renderMode === "csr") return null;
  return (
    <div data-akan-frame-fallback={slot} className={outerClassNames[slot]} style={slotStyles[slot]}>
      <div className={innerClassNames[slot]}>{children}</div>
    </div>
  );
};

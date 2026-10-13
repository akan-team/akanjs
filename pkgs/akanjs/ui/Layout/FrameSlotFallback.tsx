import { getEnv } from "akanjs/base";
import type { ReactNode } from "react";
import { type FrameSlotName, frameSlotContentClassNames, frameSlotStyles } from "./frameSlot";

const outerClassNames: { [slot in FrameSlotName]: string } = {
  topInset: "fixed inset-x-0 z-10 isolate overflow-hidden bg-background",
  topLeftAction: "fixed left-0 z-10 isolate flex aspect-1 items-center justify-center overflow-hidden",
  bottomInset: "pointer-events-none fixed inset-x-0 z-10 isolate overflow-hidden",
  keyboardInset: "pointer-events-none fixed inset-x-0 z-10 isolate overflow-hidden",
} as const;

//? The frame's top slots paint after the page and catch its clicks, so while still empty they let this chrome through.
const emptyTopSlotsStepAside =
  "#topInsetContainer:has(> #topInsetContent:empty){background-color:transparent;pointer-events:none}" +
  "#topLeftActionContainer:has(> #topLeftActionContent:empty){pointer-events:none}";

interface FrameSlotFallbackProps {
  slot: FrameSlotName;
  children: ReactNode;
}

/** Chrome drawn in place on the server, in the box its frame slot draws, until the client moves it into that slot. */
export const FrameSlotFallback = ({ slot, children }: FrameSlotFallbackProps) => {
  //? A CSR frame has no server pass, and its slots exist before the first page renders.
  if (getEnv().renderMode === "csr") return null;
  return (
    <div data-akan-frame-fallback={slot} className={outerClassNames[slot]} style={frameSlotStyles[slot]}>
      {slot === "topInset" || slot === "topLeftAction" ? <style>{emptyTopSlotsStepAside}</style> : null}
      <div className={frameSlotContentClassNames[slot]}>{children}</div>
    </div>
  );
};

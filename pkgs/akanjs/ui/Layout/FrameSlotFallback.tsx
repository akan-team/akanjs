import { getEnv } from "akanjs/base";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";
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

interface FrameSlotFallbackProps {
  slot: FrameSlotName;
  children: ReactNode;
}

/** Chrome drawn in place on the server, in the box its frame slot draws, until the client moves it into that slot. */
export const FrameSlotFallback = ({ slot, children }: FrameSlotFallbackProps) => {
  //? A CSR frame has no server pass, and its slots exist before the first page renders.
  if (getEnv().renderMode === "csr") return null;
  return (
    <div
      data-akan-frame-fallback={slot}
      className={cn(frameSlotContainerClassNames[slot], "z-10")}
      style={frameSlotStyles[slot]}
    >
      {slot === "topInset" || slot === "topLeftAction" ? <style>{emptyTopSlotsStepAside}</style> : null}
      <div className={frameSlotContentClassNames[slot]}>{children}</div>
    </div>
  );
};

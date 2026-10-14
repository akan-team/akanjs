"use client";
import { type UserDragConfig, useDrag } from "@use-gesture/react";

interface DismissDragRelease {
  dismiss: boolean;
  /** The downward speed the drag let go at, in px/ms. */
  velocity: number;
  height: number;
  /** The drag was cut off at `cutAt` rather than let go. */
  canceled: boolean;
}

interface DismissDragOptions {
  /** How far down, in px, a release must have come to dismiss, given the panel's height. */
  threshold: (height: number) => number;
  /** A release still moving down faster than this, in px/ms, dismisses short of the threshold. */
  flickSpeed?: number;
  /** A drag past this many px is cut off and judged where it stands. */
  cutAt?: number;
  heightOf?: () => number;
  enabled?: () => boolean;
  /** `y` is how far down the drag holds the panel; a drag above where it started reads negative. */
  onDrag: (y: number, height: number) => void;
  onRelease: (release: DismissDragRelease) => void;
  gesture?: UserDragConfig;
}

export const useDismissDrag = ({
  threshold,
  flickSpeed,
  cutAt,
  heightOf,
  enabled,
  onDrag,
  onRelease,
  gesture,
}: DismissDragOptions) =>
  useDrag(({ last, movement: [, my], velocity: [, vy], direction: [, dy], cancel, canceled }) => {
    if (enabled && !enabled()) return;
    const height = heightOf?.() ?? 0;
    if (cutAt !== undefined && my > cutAt) cancel();
    if (!last) {
      onDrag(my, height);
      return;
    }
    const flicked = flickSpeed !== undefined && vy > flickSpeed && dy > 0;
    onRelease({ dismiss: my > threshold(height) || flicked, velocity: vy, height, canceled });
  }, gesture);

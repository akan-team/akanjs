"use client";
import type { Handler, UserDragConfig } from "@use-gesture/react";
import { createElement, type MouseEvent, type PointerEvent, type SyntheticEvent, useRef, useState } from "react";
import type { DismissDragBind } from "./DismissDragGesture";

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
  /** No `pointer` options: they change which handlers the library binds, and `bind` relays a fixed set. */
  gesture?: Omit<UserDragConfig, "pointer" | "target" | "eventOptions">;
}

type GestureModule = typeof import("./DismissDragGesture");

const relayedKeys = [
  "onPointerDown",
  "onPointerMove",
  "onPointerUp",
  "onPointerCancel",
  "onLostPointerCapture",
  "onKeyDown",
  "onKeyUp",
  "onClickCapture",
] as const;
type RelayedKey = (typeof relayedKeys)[number];

interface HeldEvent {
  key: RelayedKey;
  event: SyntheticEvent;
  currentTarget: EventTarget;
}

const releasedTarget = {
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  hasPointerCapture: () => false,
};

let gestureModule: GestureModule | null = null;
let gestureLoad: Promise<GestureModule> | null = null;

const loadGesture = () => {
  if (!gestureLoad) {
    gestureLoad = import("./DismissDragGesture");
    gestureLoad.then(
      (module) => {
        gestureModule = module;
      },
      () => {
        gestureLoad = null;
      },
    );
  }
  return gestureLoad;
};

//? The library's tap filter, judged here while it loads: a press that moved past the tap threshold ends in no click.
const draggedPastTap = (held: HeldEvent[], tapsThreshold: number) => {
  const press = held.findLastIndex(({ key }) => key === "onPointerDown");
  let x = 0;
  let y = 0;
  let from: MouseEvent | null = null;
  for (const { event } of press < 0 ? [] : held.slice(press)) {
    if (!("clientX" in event)) continue;
    const at = event as MouseEvent;
    if (from) {
      x += Math.abs(at.clientX - from.clientX);
      y += Math.abs(at.clientY - from.clientY);
    }
    from = at;
  }
  return x > tapsThreshold || y > tapsThreshold;
};

const replay = (bind: DismissDragBind, held: HeldEvent[]) => {
  const handlers = bind();
  const released = held.some(
    ({ key }) => key === "onPointerUp" || key === "onPointerCancel" || key === "onLostPointerCapture",
  );
  for (const { key, event, currentTarget } of held) {
    const fields: PropertyDescriptorMap = { currentTarget: { value: currentTarget } };
    //? setPointerCapture throws for a pointer already let go, which would drop the press the drag starts from.
    if (key === "onPointerDown" && released) fields.target = { value: releasedTarget };
    handlers[key]?.(Object.create(event, fields) as SyntheticEvent);
  }
};

//? `@use-gesture` is not imported up front, so a page pays for it only once a panel is pressed; that press is replayed.
export const useDismissDrag = ({
  threshold,
  flickSpeed,
  cutAt,
  heightOf,
  enabled,
  onDrag,
  onRelease,
  gesture,
}: DismissDragOptions) => {
  const [loaded, setLoaded] = useState(gestureModule);
  const bindRef = useRef<DismissDragBind | null>(null);
  const heldRef = useRef<HeldEvent[] | null>(null);

  const handler: Handler<"drag"> = ({
    last,
    movement: [, my],
    velocity: [, vy],
    direction: [, dy],
    cancel,
    canceled,
  }) => {
    if (enabled && !enabled()) return;
    const height = heightOf?.() ?? 0;
    if (cutAt !== undefined && my > cutAt) cancel();
    if (!last) {
      onDrag(my, height);
      return;
    }
    const flicked = flickSpeed !== undefined && vy > flickSpeed && dy > 0;
    onRelease({ dismiss: my > threshold(height) || flicked, velocity: vy, height, canceled });
  };

  const onBind = (bind: DismissDragBind) => {
    bindRef.current = bind;
    const held = heldRef.current;
    heldRef.current = null;
    if (held) replay(bind, held);
  };

  const relay = (key: RelayedKey) => (event: SyntheticEvent) => {
    if (bindRef.current) {
      bindRef.current()[key]?.(event);
      return;
    }
    if (key === "onPointerDown" || key === "onKeyDown") {
      heldRef.current ??= [];
      const press = event as PointerEvent;
      if (key === "onPointerDown" && press.buttons === 1) (press.target as Element).setPointerCapture(press.pointerId);
      loadGesture().then(setLoaded, () => {
        heldRef.current = null;
      });
    }
    const held = heldRef.current;
    if (!held) return;
    if (key !== "onClickCapture") held.push({ key, event, currentTarget: event.currentTarget });
    else if (
      gesture?.filterTaps &&
      (event as MouseEvent).detail > 0 &&
      draggedPastTap(held, gesture.tapsThreshold ?? 3)
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const bind = () =>
    Object.fromEntries(relayedKeys.map((key) => [key, relay(key)])) as Record<
      RelayedKey,
      (event: SyntheticEvent) => void
    >;
  const driver = loaded ? createElement(loaded.DismissDragGesture, { handler, gesture, onBind }) : null;
  return { bind, driver };
};

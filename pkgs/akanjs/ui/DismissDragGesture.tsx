"use client";
import { type Handler, type UserDragConfig, useDrag } from "@use-gesture/react";
import { type EventHandler, type SyntheticEvent, useLayoutEffect } from "react";

export type DismissDragBind = () => Partial<Record<string, EventHandler<SyntheticEvent<EventTarget>>>>;

interface DismissDragGestureProps {
  handler: Handler<"drag">;
  gesture?: UserDragConfig;
  onBind: (bind: DismissDragBind) => void;
}

export const DismissDragGesture = ({ handler, gesture, onBind }: DismissDragGestureProps) => {
  const bind = useDrag(handler, gesture);
  useLayoutEffect(() => {
    onBind(bind);
  });
  return null;
};

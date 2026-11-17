"use client";
import { useEffect, useRef } from "react";
import { OpenSurfaces } from "./openSurfaces";

/**
 * Calls `onEscape` on Escape, or an app's back button, while `active` and this surface is the newest active one.
 * `back: false` leaves the back button to the page: for a hint the person did not open, such as a tooltip.
 */
export const useEscapeKey = (active: boolean, onEscape: () => void, { back = true }: { back?: boolean } = {}) => {
  const callbackRef = useRef(onEscape);
  useEffect(() => {
    callbackRef.current = onEscape;
  });
  useEffect(
    () => (active ? OpenSurfaces.open(() => callbackRef.current(), { takesBack: back }) : undefined),
    [active, back],
  );
};

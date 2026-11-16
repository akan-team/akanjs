"use client";
import { useEffect, useRef } from "react";

/**
 * The surfaces open on the page (dialogs, sheets, confirms), newest last. Escape and an app's back button close the
 * newest one only: per-component listeners would all hear one key and close nested surfaces together.
 */
export class OpenSurfaces {
  static readonly #stack: (() => void)[] = [];
  static readonly #listeners = new Set<() => void>();

  static open(close: () => void) {
    const entry = () => close();
    OpenSurfaces.#stack.push(entry);
    if (OpenSurfaces.#stack.length === 1) window.addEventListener("keydown", OpenSurfaces.#onKeyDown);
    OpenSurfaces.#notify();
    return () => {
      const index = OpenSurfaces.#stack.lastIndexOf(entry);
      if (index !== -1) OpenSurfaces.#stack.splice(index, 1);
      if (OpenSurfaces.#stack.length === 0) window.removeEventListener("keydown", OpenSurfaces.#onKeyDown);
      OpenSurfaces.#notify();
    };
  }

  /** Closes the newest open surface; `false` when none is open. */
  static closeNewest() {
    const newest = OpenSurfaces.#stack.at(-1);
    if (!newest) return false;
    newest();
    return true;
  }

  static isOpen() {
    return OpenSurfaces.#stack.length > 0;
  }

  static listen(listener: () => void) {
    OpenSurfaces.#listeners.add(listener);
    return () => {
      OpenSurfaces.#listeners.delete(listener);
    };
  }

  static #notify() {
    for (const listener of OpenSurfaces.#listeners) listener();
  }

  static #onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || !OpenSurfaces.isOpen()) return;
    event.preventDefault();
    OpenSurfaces.closeNewest();
  };
}

/** Calls `onEscape` on Escape, or an app's back button, while `active` and this surface is the newest active one. */
export const useEscapeKey = (active: boolean, onEscape: () => void) => {
  const callbackRef = useRef(onEscape);
  useEffect(() => {
    callbackRef.current = onEscape;
  });
  useEffect(() => (active ? OpenSurfaces.open(() => callbackRef.current()) : undefined), [active]);
};

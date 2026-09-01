"use client";
import { useEffect, useState } from "react";

/**
 * How much of the layout viewport the on-screen keyboard is covering.
 *
 * `visualViewport` is the only thing that reports it — `dvh` tracks the browser's own chrome and not the
 * keyboard — and a full-screen chat whose composer sits under the keyboard is one nobody can type into. Answers
 * 0 wherever the API is absent, which is every desktop case and the server.
 */
export const useKeyboardInset = () => {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const measure = () => setInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);
  return inset;
};

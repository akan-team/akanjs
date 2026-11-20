"use client";

import { use, useEffect, useState, useSyncExternalStore } from "react";
import { PendingNavigation, type PendingNavigationEntry } from "../client/pendingNavigation";
import { PressLoading } from "../client/pressLoading";

const none = () => null;

const pressOf = (born: PendingNavigationEntry | null) => {
  const entry = PendingNavigation.entry();
  //? The navigation that brought this page is still in flight while React draws it, and is not one leaving it.
  return entry && entry !== born && entry.waits && !entry.traversal ? entry : null;
};

//? Rendered inside the page's `.loading()` boundary: suspending here shows that fallback at once and keeps the page
//? mounted under it, so a navigation that fails or is overtaken gets the page back with its state.
export function AkanPressLoading({
  pattern,
  shadowedBy,
  delayMs,
}: {
  pattern: string;
  shadowedBy: string[];
  delayMs: number;
}): null {
  const [born] = useState(() => PendingNavigation.entry());
  const press = useSyncExternalStore(PendingNavigation.subscribe, () => pressOf(born), none);
  const [late, setLate] = useState(false);
  //? Once shown, the fallback stays through a redirect to another page: the page being left would flash back otherwise.
  const waiting =
    !!press && (late || (!!press.from && PressLoading.staysOnPage(pattern, shadowedBy, press.from, press.href)));
  useEffect(() => {
    if (!waiting) {
      setLate(false);
      return;
    }
    const timer = setTimeout(() => setLate(true), delayMs);
    return () => clearTimeout(timer);
  }, [waiting, delayMs]);
  if (press && late) use(PendingNavigation.left(press));
  return null;
}

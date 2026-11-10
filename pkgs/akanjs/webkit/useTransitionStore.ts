"use client";
import { useEffect, useState } from "react";

//? Not useSyncExternalStore: it renders a store change at once even inside startTransition, so the reset a full RSC
//? commit makes would show the last full page's head, path and body for a frame before the new page commits.
export const useTransitionStore = <T>(subscribe: (listener: () => void) => () => void, read: () => T): T => {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const sync = () => setValue(() => read());
    const unsubscribe = subscribe(sync);
    sync();
    return unsubscribe;
  }, [subscribe, read]);
  return value;
};

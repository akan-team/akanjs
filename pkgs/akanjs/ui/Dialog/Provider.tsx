"use client";
import { clsx } from "akanjs/client";
import { type ReactNode, useEffect, useState } from "react";

import { DialogContext } from "./context";

export interface ProviderProps {
  /** Additional classes for the dialog root wrapper. */
  className?: string;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state for uncontrolled usage. */
  defaultOpen?: boolean;
  children?: ReactNode;
}
export const Provider = ({ className, defaultOpen = false, open = defaultOpen, children }: ProviderProps) => {
  const [openState, setOpenState] = useState(defaultOpen);
  const [title, setTitle] = useState<ReactNode>(null);
  const [action, setAction] = useState<ReactNode>(null);
  useEffect(() => {
    setOpenState(open);
  }, [open]);
  return (
    <DialogContext.Provider value={{ open: openState, setOpen: setOpenState, title, setTitle, action, setAction }}>
      <div data-open={openState} className={clsx("group/dialog", className)}>
        {children}
      </div>
    </DialogContext.Provider>
  );
};

"use client";
import { clsx } from "@akanjs/client";
import * as Dialog from "@radix-ui/react-dialog";
import { ReactNode, useEffect, useState } from "react";

import { DialogContext } from "./context";

export interface ProviderProps {
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  children?: any;
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
      <Dialog.Root open={openState}>
        <div data-open={openState} className={clsx("group/dialog", className)}>
          {children}
        </div>
      </Dialog.Root>
    </DialogContext.Provider>
  );
};

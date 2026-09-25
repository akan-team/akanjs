"use client";
import type { ReactNode } from "react";
import { sharedContext } from "../../client/sharedContext";

export interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  openDialog: () => void;
  closeDialog: () => void;
  /**
   * How this dialog actually dismisses, handed up by whichever surface is drawing it. `confirmClose` and
   * `onCancel` hang off that path, so a close that only flipped `open` would skip both — which is what made an
   * agent's close, and `Dialog.Close`, quietly different from clicking the X.
   */
  registerDismiss: (dismiss: (() => void) | null) => void;
  title: ReactNode;
  setTitle: (title: ReactNode) => void;
  action: ReactNode;
  setAction: (action: ReactNode) => void;
}

export const DialogContext = sharedContext<DialogContextType>("dialog", {
  open: false,
  setOpen: (open: boolean) => null,
  openDialog: () => null,
  closeDialog: () => null,
  registerDismiss: (dismiss: (() => void) | null) => null,
  title: null,
  setTitle: (title: ReactNode) => null,
  action: null,
  setAction: (action: ReactNode) => null,
});

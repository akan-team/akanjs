"use client";
import { createContext, ReactNode } from "react";

export interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  title: ReactNode;
  setTitle: (title: ReactNode) => void;
  action: ReactNode;
  setAction: (action: ReactNode) => void;
}

export const DialogContext = createContext<DialogContextType>({
  open: false,
  setOpen: (open: boolean) => null,
  title: null,
  setTitle: (title: ReactNode) => null,
  action: null,
  setAction: (action: ReactNode) => null,
});

"use client";
import { type ReactNode, useContext } from "react";

import { DialogContext } from "./context";

export interface CloseProps {
  className?: string;
  children?: ReactNode;
}
export const Close = ({ className, children }: CloseProps) => {
  const { setOpen } = useContext(DialogContext);
  return (
    <a
      className={className}
      onClick={() => {
        setOpen(false);
      }}
    >
      {children}
    </a>
  );
};

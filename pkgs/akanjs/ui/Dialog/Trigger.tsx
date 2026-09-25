"use client";
import { type ReactNode, useContext } from "react";

import { DialogContext } from "./context";

export interface TriggerProps {
  className?: string;
  children?: ReactNode;
}
export const Trigger = ({ className, children }: TriggerProps) => {
  const { setOpen } = useContext(DialogContext);
  return (
    <div
      className={className}
      onClick={() => {
        setOpen(true);
      }}
    >
      {children}
    </div>
  );
};

"use client";
import { useContext } from "react";

import { DialogContext } from "./context";

export interface TriggerProps {
  className?: string;
  children?: any;
}
export const Trigger = ({ className, children }: TriggerProps) => {
  const { setOpen } = useContext(DialogContext);
  return (
    <a
      className={className}
      onClick={() => {
        setOpen(true);
      }}
    >
      {children}
    </a>
  );
};

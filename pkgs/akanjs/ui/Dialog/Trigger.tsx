"use client";
import { type ReactNode, useContext } from "react";

import { agentAttrs } from "../agentAttrs";
import { DialogContext } from "./context";

export interface TriggerProps {
  className?: string;
  children?: ReactNode;
}
export const Trigger = ({ className, children }: TriggerProps) => {
  const { openDialog } = useContext(DialogContext);
  return (
    <div className={className} onClick={openDialog} {...agentAttrs(openDialog)}>
      {children}
    </div>
  );
};

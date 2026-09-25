"use client";
import { type ReactNode, useContext } from "react";

import { agentAttrs } from "../agentAttrs";
import { DialogContext } from "./context";

export interface CloseProps {
  className?: string;
  children?: ReactNode;
}
export const Close = ({ className, children }: CloseProps) => {
  const { closeDialog } = useContext(DialogContext);
  return (
    <a className={className} onClick={closeDialog} {...agentAttrs(closeDialog)}>
      {children}
    </a>
  );
};

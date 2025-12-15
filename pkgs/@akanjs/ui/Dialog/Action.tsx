"use client";
import { ReactNode, useContext, useEffect } from "react";

import { DialogContext } from "./context";

export interface ActionProps {
  children?: ReactNode;
}
export const Action = ({ children }: ActionProps) => {
  const { setAction } = useContext(DialogContext);
  useEffect(() => {
    setAction(children);
  }, [children]);
  return null;
};

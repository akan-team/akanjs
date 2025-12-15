"use client";
import { ReactNode, useContext, useEffect } from "react";

import { DialogContext } from "./context";

export interface TitleProps {
  children?: ReactNode;
}
export const Title = ({ children }: TitleProps) => {
  const { setTitle } = useContext(DialogContext);
  useEffect(() => {
    setTitle(children);
  }, [children]);
  return null;
};

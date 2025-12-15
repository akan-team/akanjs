"use client";

import { useRef } from "react";

import { PrintContext } from "./context";

export interface ProviderProps {
  children: React.ReactNode;
}
export const Provider = ({ children }: ProviderProps) => {
  const ref = useRef<HTMLDivElement>(null);
  return <PrintContext.Provider value={{ ref }}>{children}</PrintContext.Provider>;
};

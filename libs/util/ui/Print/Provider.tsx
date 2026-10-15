"use client";

import { useRef } from "react";

import { PrintContext } from "./context";

export interface ProviderProps {
  children: React.ReactNode;
  name?: string;
}
export const Provider = ({ children, name }: ProviderProps) => {
  const ref = useRef<HTMLDivElement>(null);
  return <PrintContext.Provider value={{ ref, name }}>{children}</PrintContext.Provider>;
};

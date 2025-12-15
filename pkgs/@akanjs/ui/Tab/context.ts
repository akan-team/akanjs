"use client";
import { createContext, type RefObject } from "react";

interface TabContextType {
  defaultMenu: string | null;
  menu: string | null;
  setMenu: (value: string | null) => void;
  menuSet: RefObject<Set<string>>;
}

export const TabContext = createContext<TabContextType>({
  defaultMenu: null,
  menu: null,
  setMenu: (value: string | null) => null,
  menuSet: null as unknown as RefObject<Set<string>>,
});

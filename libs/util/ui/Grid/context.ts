"use client";
import { createContext, type RefObject } from "react";

interface GridContextType {
  viewRef: RefObject<HTMLDivElement | null> | null;
  setViewRef: (value: RefObject<HTMLDivElement | null> | null) => void;
}

export const GridContext = createContext<GridContextType>({
  viewRef: null as unknown as RefObject<HTMLDivElement | null> | null,
  setViewRef: () => {
    //
  },
});

interface GridUnitContextType {
  open: boolean;
}

export const GridUnitContext = createContext<GridUnitContextType>({
  open: false,
});

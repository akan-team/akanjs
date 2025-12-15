"use client";
import { createContext, RefObject } from "react";

interface PrintContextType {
  ref: RefObject<HTMLDivElement | null>;
}

export const PrintContext = createContext<PrintContextType>({
  ref: null as unknown as RefObject<HTMLDivElement | null>,
});

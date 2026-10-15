"use client";
import { createContext, type RefObject } from "react";

interface PrintContextType {
  ref: RefObject<HTMLDivElement | null>;
  name?: string;
}

export const PrintContext = createContext<PrintContextType>({
  ref: null as unknown as RefObject<HTMLDivElement | null>,
});

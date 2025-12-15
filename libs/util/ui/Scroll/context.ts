"use client";
import { createContext, type ReactNode } from "react";

interface ScrollContextType {
  slide: string;
  setSlide: (value: string) => void;
  slideIds: string[];
  slides: { id: string; title: ReactNode }[];
}

export const ScrollContext = createContext<ScrollContextType>({
  slide: "",
  setSlide: (value: string) => "",
  slideIds: [],
  slides: [],
});

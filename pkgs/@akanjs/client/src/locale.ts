"use client";
import { createContext } from "react";

export const dictionaryContext = createContext<{ [key: string]: { [key: string]: string } }>({});

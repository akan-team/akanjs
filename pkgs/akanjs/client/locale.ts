"use client";
import { sharedContext } from "./sharedContext";

export const dictionaryContext = sharedContext<{ [key: string]: { [key: string]: string } }>("dictionary", {});

"use client";
import { sharedContext } from "./sharedContext";

/** @deprecated Nothing in akanjs provides or reads it; removed in a later minor. */
export const dictionaryContext = sharedContext<{ [key: string]: { [key: string]: string } }>("dictionary", {});

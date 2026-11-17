"use client";
import { use } from "react";
import { preloadModule } from "react-dom";
import { DictionaryPart } from "../../client/dictionaryPart";

//? `l()` reads synchronously, so a reader suspends until its file is merged; the server, whole already, preloads it.
export const useApiDescriptions = (lang: string) => {
  const url = DictionaryPart.urlOf(lang, DictionaryPart.api);
  if (url && typeof window === "undefined") preloadModule(url, { as: "script" });
  use(DictionaryPart.ready(lang, DictionaryPart.api));
};

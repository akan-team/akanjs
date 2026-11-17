import { Translator } from "akanjs/client";
import { isRecord, parseAkanI18nEnv } from "akanjs/common";
import { actionErrorKey } from "./actionErrorKey";

type TranslationParam = Record<string, string | number>;

const actionErrorDataOf = (error: unknown): TranslationParam | undefined => {
  if (!isRecord(error) || !isRecord(error.data)) return undefined;
  const data = Object.fromEntries(
    Object.entries(error.data).filter((entry): entry is [string, string | number] =>
      ["string", "number"].includes(typeof entry[1]),
    ),
  );
  return Object.keys(data).length ? data : undefined;
};

export const actionErrorMessageOf = (error: unknown) => {
  const lang = Translator.getActiveLocale() ?? parseAkanI18nEnv().defaultLocale;
  return Translator.translateByLocale(lang, actionErrorKey(error), actionErrorDataOf(error));
};

//? A toast is shown once, so an error of a module whose texts the route did not load waits for them.
export const showActionErrorMessage = (error: unknown, show: (content: string) => void) => {
  const lang = Translator.getActiveLocale() ?? parseAkanI18nEnv().defaultLocale;
  const ready = Translator.ready(lang, actionErrorKey(error));
  if (!ready) return show(actionErrorMessageOf(error));
  void ready.then(() => show(actionErrorMessageOf(error)));
};

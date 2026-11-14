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

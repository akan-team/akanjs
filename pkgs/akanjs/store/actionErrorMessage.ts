import { Translator } from "akanjs/client";
import { isRecord, Logger, parseAkanI18nEnv } from "akanjs/common";
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

//? Never throws or rejects: the caller is a failed action, whose own rejection must stay the one its caller sees.
export const showActionErrorMessage = (error: unknown, show: (content: string) => void) => {
  const warn = (cause: unknown) =>
    Logger.warn(`Failed to show action error message: ${cause instanceof Error ? cause.message : String(cause)}`);
  try {
    const lang = Translator.getActiveLocale() ?? parseAkanI18nEnv().defaultLocale;
    const ready = Translator.ready(lang, actionErrorKey(error));
    if (!ready) return show(actionErrorMessageOf(error));
    //? A toast is shown once, so an error of a module whose texts the route did not load waits for them.
    void ready.then(() => show(actionErrorMessageOf(error))).catch(warn);
  } catch (cause) {
    warn(cause);
  }
};

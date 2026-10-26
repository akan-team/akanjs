import { interpolateTranslation, parseAkanI18nEnv, pathGetLoose } from "akanjs/common";

import { type AllDictionary, type Dictionary, TranslatorState } from "./translatorState";

export type { AllDictionary, Dictionary } from "./translatorState";

export class Translator {
  constructor(dictionary: Record<string, Record<string, Record<string, unknown>>>) {
    Object.entries(dictionary).forEach(([lang, dict]) => {
      Translator.seed(lang, dict as Dictionary);
    });
  }
  hasDictionary(lang: string) {
    return Translator.hasLocale(lang);
  }
  static hasLocale(lang: string) {
    return TranslatorState.get().langDictionaryMap.has(lang);
  }
  static setActiveLocale(lang: string | undefined) {
    if (lang) TranslatorState.get().activeLocale = lang;
  }
  static getActiveLocale(): string | undefined {
    return TranslatorState.get().activeLocale;
  }
  static setActivePath(path: string | undefined) {
    const state = TranslatorState.get();
    if (path) state.activePath = path;
    else delete state.activePath;
  }
  static getActivePath(): string | undefined {
    return TranslatorState.get().activePath;
  }
  static renderAt<T>(path: string | undefined, render: () => T): T {
    if (!path) return render();
    const state = TranslatorState.get();
    const outer = state.renderPath;
    state.renderPath = path;
    try {
      return render();
    } finally {
      state.renderPath = outer;
    }
  }
  static getRenderPath(): string | undefined {
    return TranslatorState.get().renderPath;
  }
  static markHydrated() {
    delete TranslatorState.get().activePath;
  }
  static translateByLocale(lang: string, key: string, param?: Record<string, string | number>): string {
    const msg = Translator.#lookup(lang, key) ?? Translator.#lookupDefault(lang, key) ?? key;
    return interpolateTranslation(msg, param);
  }
  static #lookup(lang: string, key: string) {
    const dictionary = TranslatorState.get().langDictionaryMap.get(lang);
    if (!dictionary) return undefined;
    const node = pathGetLoose(key, dictionary, ".") as { t?: unknown } | null;
    return typeof node?.t === "string" ? node.t : undefined;
  }
  // A locale no lib dictionary wrote falls back to the default locale's text: the dotted key as prose is always wrong.
  static #lookupDefault(lang: string, key: string) {
    const { defaultLocale } = parseAkanI18nEnv();
    return defaultLocale === lang ? undefined : Translator.#lookup(defaultLocale, key);
  }
  // An SSR client is seeded with one locale only, so `#lookupDefault` has nothing to reach there: ship the text inside it.
  static fillFromDefault(allDictionary: AllDictionary, lang: string, defaultLocale: string): Dictionary {
    const fallback = allDictionary[defaultLocale];
    if (lang === defaultLocale || !fallback) return allDictionary[lang] ?? {};
    return Translator.#fillGaps(allDictionary[lang] ?? {}, fallback) as Dictionary;
  }
  static #fillGaps(own: Record<string, unknown>, fallback: Record<string, unknown>): Record<string, unknown> {
    const filled = { ...own };
    for (const [key, value] of Object.entries(fallback)) {
      const ownValue = filled[key];
      if (ownValue === undefined) filled[key] = value;
      else if (Translator.#isNode(ownValue) && Translator.#isNode(value))
        filled[key] = Translator.#fillGaps(ownValue, value);
    }
    return filled;
  }
  static #isNode(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  // Merges without dropping existing keys; the same snapshot object is skipped.
  static seed(lang: string, dict: Dictionary | undefined) {
    if (!dict) return;
    const state = TranslatorState.get();
    if (state.seededDicts.has(dict)) return;
    state.seededDicts.add(dict);
    const existingDictionary = state.langDictionaryMap.get(lang) ?? {};
    Object.entries(dict).forEach(([key, modelDict]) => {
      if (existingDictionary[key]) Object.assign(existingDictionary[key], modelDict);
      else existingDictionary[key] = modelDict as Dictionary[string];
    });
    state.langDictionaryMap.set(lang, existingDictionary);
  }
  static replace(lang: string, dict: Dictionary | undefined) {
    TranslatorState.replace(lang, dict);
  }
  translate(lang: string, key: string, param?: Record<string, string | number>): string {
    return Translator.translateByLocale(lang, key, param);
  }
  async getDictionary(lang: string) {
    const dictionary = TranslatorState.get().langDictionaryMap.get(lang);
    if (!dictionary) throw new Error(`Dictionary for language ${lang} not found`);
    return dictionary;
  }
}

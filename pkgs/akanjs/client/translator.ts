import { interpolateTranslation, parseAkanI18nEnv, pathGetLoose } from "akanjs/common";

export interface Dictionary {
  [key: string]: {
    [key: string]: unknown;
  };
}
export interface AllDictionary {
  [key: string]: Dictionary;
}

interface TranslatorState {
  langDictionaryMap: Map<string, Dictionary>;
  // A seeded snapshot is one reference per build, so a repeat seed skips the merge.
  seededDicts: WeakSet<object>;
  replacedDicts: WeakSet<object>;
  // Browser-only: never written on the server, where concurrent requests share this state.
  activeLocale?: string;
  // Browser-only copy of the server-resolved path, so the first client render matches SSR.
  activePath?: string;
  // The URL path of the CSR stack entry whose route render is running: a pushed entry renders before the URL moves.
  renderPath?: string;
}

const TRANSLATOR_STATE_KEY = "__AKAN_TRANSLATOR_STATE__";
const getTranslatorState = (): TranslatorState => {
  const globalScope = globalThis as typeof globalThis & {
    [TRANSLATOR_STATE_KEY]?: TranslatorState;
  };
  globalScope[TRANSLATOR_STATE_KEY] ??= {
    langDictionaryMap: new Map<string, Dictionary>(),
    seededDicts: new WeakSet<object>(),
    replacedDicts: new WeakSet<object>(),
  };
  return globalScope[TRANSLATOR_STATE_KEY];
};

export class Translator {
  static readonly #filledDicts = new WeakMap<AllDictionary, Map<string, Dictionary>>();
  constructor(dictionary: Record<string, Record<string, Record<string, unknown>>>) {
    Object.entries(dictionary).forEach(([lang, dict]) => {
      Translator.seed(lang, dict as Dictionary);
    });
  }
  hasDictionary(lang: string) {
    return getTranslatorState().langDictionaryMap.has(lang);
  }
  static setActiveLocale(lang: string | undefined) {
    if (lang) getTranslatorState().activeLocale = lang;
  }
  static getActiveLocale(): string | undefined {
    return getTranslatorState().activeLocale;
  }
  static setActivePath(path: string | undefined) {
    const state = getTranslatorState();
    if (path) state.activePath = path;
    else delete state.activePath;
  }
  static getActivePath(): string | undefined {
    return getTranslatorState().activePath;
  }
  static renderAt<T>(path: string | undefined, render: () => T): T {
    if (!path) return render();
    const state = getTranslatorState();
    const outer = state.renderPath;
    state.renderPath = path;
    try {
      return render();
    } finally {
      state.renderPath = outer;
    }
  }
  static getRenderPath(): string | undefined {
    return getTranslatorState().renderPath;
  }
  static markHydrated() {
    delete getTranslatorState().activePath;
  }
  static translateByLocale(lang: string, key: string, param?: Record<string, string | number>): string {
    const msg = Translator.#lookup(lang, key) ?? Translator.#lookupDefault(lang, key) ?? key;
    return interpolateTranslation(msg, param);
  }
  static #lookup(lang: string, key: string) {
    const dictionary = getTranslatorState().langDictionaryMap.get(lang);
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
  static withDefaultLocale(allDictionary: AllDictionary, lang: string): Dictionary | undefined {
    const { defaultLocale } = parseAkanI18nEnv();
    const fallback = allDictionary[defaultLocale];
    if (lang === defaultLocale || !fallback) return allDictionary[lang];
    const filledByLocale = Translator.#filledDicts.get(allDictionary) ?? new Map<string, Dictionary>();
    Translator.#filledDicts.set(allDictionary, filledByLocale);
    const filled =
      filledByLocale.get(lang) ?? (Translator.#fillGaps(allDictionary[lang] ?? {}, fallback) as Dictionary);
    filledByLocale.set(lang, filled);
    return filled;
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
    const state = getTranslatorState();
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
    if (!dict) return;
    const state = getTranslatorState();
    if (state.replacedDicts.has(dict)) return;
    state.seededDicts.add(dict);
    state.replacedDicts.add(dict);
    state.langDictionaryMap.set(lang, { ...dict });
  }
  translate(lang: string, key: string, param?: Record<string, string | number>): string {
    return Translator.translateByLocale(lang, key, param);
  }
  async getDictionary(lang: string) {
    const dictionary = getTranslatorState().langDictionaryMap.get(lang);
    if (!dictionary) throw new Error(`Dictionary for language ${lang} not found`);
    return dictionary;
  }
}

import { pathGet } from "akanjs/common";

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
  // Tracks dictionary objects already merged into the map. The seeded snapshot
  // (`allDictionary[lang]`) is a stable reference within a build, so repeat seeds skip the merge.
  seededDicts: WeakSet<object>;
  // Tracks dictionary snapshots already installed via replace. Replacing is snapshot semantics, but
  // the same object may be passed repeatedly while rendering the same build.
  replacedDicts: WeakSet<object>;
  // Browser-only source of truth for the active locale (set by ClientWrapper from the server-resolved
  // `lang`). Never written on the server (concurrent requests share this state), where locale stays
  // request-scoped via getPageInfo/x-locale.
  activeLocale?: string;
  // Browser-only copy of the server-resolved route path. This keeps the first client render aligned
  // with SSR; after hydration, usePage can derive the path from window.location again.
  activePath?: string;
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
  static markHydrated() {
    delete getTranslatorState().activePath;
  }
  static translateByLocale(lang: string, key: string, param?: Record<string, string | number>): string {
    const dictionary = getTranslatorState().langDictionaryMap.get(lang);
    if (!dictionary) return key;
    const msg = (pathGet(key, dictionary, ".", { t: key }) as { t: string }).t;
    return param ? msg.replace(/{([^}]+)}/g, (_, key: string) => param[key] as string) : msg;
  }
  // Synchronously merge a single locale's dictionary into the shared map.
  // Idempotent: re-seeding the same locale merges keys without dropping existing ones, and re-seeding
  // the exact same snapshot object is skipped for performance.
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

import { pathGet } from "akanjs/common";

export interface Dictionary {
  [key: string]: {
    [key: string]: unknown;
  };
}
export interface AllDictionary {
  [key: string]: Dictionary;
}

export class Translator {
  static #langDictionaryMap = new Map<string, Dictionary>();
  // Tracks dictionary objects already merged into the static map. The seeded
  // snapshot (`allDictionary[lang]`) is a stable module-level reference within a
  // build, so repeat requests skip the merge entirely. A dev rebuild produces a
  // new object reference, which re-seeds and keeps hot reload correct.
  static #seededDicts = new WeakSet<object>();
  constructor(dictionary: Record<string, Record<string, Record<string, unknown>>>) {
    Object.entries(dictionary).forEach(([lang, dictionary]) => {
      this.#setDictionary(lang, dictionary);
    });
  }
  hasDictionary(lang: string) {
    return Translator.#langDictionaryMap.has(lang);
  }
  // Synchronously merge a single locale's dictionary into the shared static map.
  // Idempotent: re-seeding the same locale merges keys without dropping existing ones.
  // Used by ClientWrapper to seed the active locale from the server-provided prop.
  static seed(lang: string, dict: Dictionary | undefined) {
    if (!dict) return;
    // Skip the merge when this exact dictionary snapshot was already seeded.
    if (Translator.#seededDicts.has(dict)) return;
    Translator.#seededDicts.add(dict);
    const existingDictionary = Translator.#langDictionaryMap.get(lang) ?? {};
    Object.entries(dict).forEach(([key, modelDict]) => {
      if (existingDictionary[key]) Object.assign(existingDictionary[key], modelDict);
      else existingDictionary[key] = modelDict as Dictionary[string];
    });
    Translator.#langDictionaryMap.set(lang, existingDictionary);
  }
  #setDictionary(lang: string, dict: Dictionary) {
    Translator.seed(lang, dict);
    return Translator.#langDictionaryMap.get(lang) as Dictionary;
  }
  translate(lang: string, key: string, param?: Record<string, string | number>): string {
    const dictionary = Translator.#langDictionaryMap.get(lang);
    if (!dictionary) return key;
    const msg = (pathGet(key, dictionary, ".", { t: key }) as { t: string }).t;
    return param ? msg.replace(/{([^}]+)}/g, (_, key: string) => param[key] as string) : msg;
  }
  async getDictionary(lang: string) {
    const dictionary = Translator.#langDictionaryMap.get(lang);
    if (!dictionary) throw new Error(`Dictionary for language ${lang} not found`);
    return dictionary;
  }
}

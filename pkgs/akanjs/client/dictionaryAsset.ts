import { type Dictionary, TranslatorState } from "./translatorState";

interface DictionaryModule {
  lang: string;
  default: Dictionary;
}

export class DictionaryAsset {
  static readonly #loads = new Map<string, Promise<DictionaryModule>>();
  static #retrySeq = 0;

  static async load(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const loading = DictionaryAsset.#loads.get(url) ?? DictionaryAsset.#import(url);
    DictionaryAsset.#loads.set(url, loading);
    const { lang, default: dictionary } = await loading;
    TranslatorState.replace(lang, dictionary);
  }

  //? A browser keeps a failed module fetch in its module map, so the retry imports the same file under a fresh query.
  static async #import(url: string): Promise<DictionaryModule> {
    try {
      return (await import(url)) as DictionaryModule;
    } catch {
      try {
        return (await import(`${url}?retry=${++DictionaryAsset.#retrySeq}`)) as DictionaryModule;
      } catch (error) {
        DictionaryAsset.#loads.delete(url);
        throw error;
      }
    }
  }
}

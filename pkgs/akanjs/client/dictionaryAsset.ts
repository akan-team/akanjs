import { type DictionaryModule, importDictionaryModule } from "./dictionaryModule";
import { TranslatorState } from "./translatorState";

export class DictionaryAsset {
  static readonly #loads = new Map<string, Promise<DictionaryModule>>();
  static readonly #appliedSeqByLang = new Map<string, number>();
  static #seq = 0;

  static async load(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const seq = ++DictionaryAsset.#seq;
    const loading = DictionaryAsset.#loads.get(url) ?? DictionaryAsset.#import(url);
    DictionaryAsset.#loads.set(url, loading);
    const { lang, default: dictionary, parts } = await loading;
    //? A file asked for before another of its locale but answered after it belongs to the page that was left.
    if ((DictionaryAsset.#appliedSeqByLang.get(lang) ?? 0) > seq) return;
    DictionaryAsset.#appliedSeqByLang.set(lang, seq);
    TranslatorState.replace(lang, dictionary, parts);
  }

  static async #import(url: string): Promise<DictionaryModule> {
    try {
      return await importDictionaryModule(url);
    } catch (error) {
      DictionaryAsset.#loads.delete(url);
      throw error;
    }
  }
}

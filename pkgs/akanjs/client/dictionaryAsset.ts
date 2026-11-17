import { type DictionaryModule, importDictionaryModule } from "./dictionaryModule";
import { DictionaryPart } from "./dictionaryPart";
import { TranslatorState } from "./translatorState";

interface DictionaryAssetState {
  loads: Map<string, Promise<DictionaryModule>>;
  appliedSeqByLang: Map<string, number>;
  seq: number;
  //? The snapshots a page file replaced its locale with, which hold every group: a route's file adds nothing to one.
  wholes: WeakSet<object>;
}

const dictionaryAssetStateKey = "__AKAN_DICTIONARY_ASSET__";

//? On `globalThis`, as `TranslatorState` is: the RSC client entry and a page's `akanjs/client` may each bundle a copy.
export class DictionaryAsset {
  static #state(): DictionaryAssetState {
    const globalScope = globalThis as typeof globalThis & { [dictionaryAssetStateKey]?: DictionaryAssetState };
    globalScope[dictionaryAssetStateKey] ??= {
      loads: new Map(),
      appliedSeqByLang: new Map(),
      seq: 0,
      wholes: new WeakSet(),
    };
    return globalScope[dictionaryAssetStateKey];
  }

  //? One page file, or a route's files, comma-separated as the document and the RSC response name them.
  static async load(urls: string | readonly string[] | null | undefined): Promise<void> {
    const list = (typeof urls === "string" ? urls.split(",") : (urls ?? [])).filter(Boolean);
    if (!list.length) return;
    const state = DictionaryAsset.#state();
    const seq = ++state.seq;
    TranslatorState.get().loadSeq = seq;
    const loaded = await Promise.allSettled(list.map((url) => DictionaryAsset.#loading(url)));
    loaded.forEach((result, idx) => {
      const url = list[idx];
      if (result.status === "fulfilled" && url) DictionaryAsset.#apply(url, result.value, seq);
    });
    const failed = loaded.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
  }

  //? A route file asked for by a key the build did not count: merged only onto the build its locale already holds.
  static async add(url: string): Promise<boolean> {
    const dictionaryModule = await DictionaryAsset.#loading(url);
    return DictionaryAsset.#apply(url, dictionaryModule, null);
  }

  static holdsEveryGroup(lang: string): boolean {
    const replaced = TranslatorState.get().replacedByLang.get(lang);
    return !!replaced && DictionaryAsset.#state().wholes.has(replaced);
  }

  //? A route's files only ever add groups to their locale, so a file of the page that was left still merges; a page
  //? file, or another build's, replaces the locale, unless it was asked for before the one already applied.
  static #apply(
    url: string,
    { lang, default: dictionary, parts, table, groups, part }: DictionaryModule,
    seq: number | null,
  ) {
    const state = DictionaryAsset.#state();
    const translator = TranslatorState.get();
    const replaced = translator.replacedByLang.get(lang);
    if (part)
      return (
        !!replaced && DictionaryPart.urlOf(lang, part) === url && DictionaryPart.merge(lang, url, dictionary, replaced)
      );
    const sameBuild = !!table && !!replaced && translator.tableByLang.get(lang) === table;
    if (groups && sameBuild) {
      if (!state.wholes.has(replaced)) DictionaryPart.merge(lang, url, dictionary, replaced);
      return true;
    }
    if (seq === null || (state.appliedSeqByLang.get(lang) ?? 0) > seq) return false;
    state.appliedSeqByLang.set(lang, seq);
    if (!groups) {
      state.wholes.add(dictionary);
      TranslatorState.replace(lang, dictionary, parts, table);
      return true;
    }
    const base = {};
    TranslatorState.replace(lang, base, parts, table);
    return DictionaryPart.merge(lang, url, dictionary, base);
  }

  static #loading(url: string): Promise<DictionaryModule> {
    const { loads } = DictionaryAsset.#state();
    const known = loads.get(url);
    if (known) return known;
    const loading = importDictionaryModule(url).catch((error: unknown) => {
      loads.delete(url);
      throw error;
    });
    loads.set(url, loading);
    return loading;
  }
}

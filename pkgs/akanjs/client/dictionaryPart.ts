import { importDictionaryModule } from "./dictionaryModule";
import { type Dictionary, TranslatorState } from "./translatorState";

export interface DictionaryPartLoad extends Promise<void> {
  status: "pending" | "fulfilled";
  value: undefined;
}

interface DictionaryPartState {
  //? Keyed by the locale's dictionary object: a replace starts a new one, and the files merged onto the old go with it.
  mergedByDictionary: WeakMap<object, Set<string>>;
  //? Kept once settled: React replays a suspended reader with the promise it threw and warns on any other.
  loads: Map<string, DictionaryPartLoad>;
  //? The `loadSeq` each file failed under: a re-render on that page reuses the settled load, as a new try suspends it.
  failedAt: Map<string, number | undefined>;
}

const dictionaryPartStateKey = "__AKAN_DICTIONARY_PART__";
//? React's `use()` reads a promise already marked fulfilled without suspending.
const settled: DictionaryPartLoad = Object.assign(Promise.resolve(), {
  status: "fulfilled" as const,
  value: undefined,
});

//? Out of `DictionaryAsset`, which every page's entry carries: only a page showing a part pays for loading one.
export class DictionaryPart {
  static readonly api = "api";

  static #state(): DictionaryPartState {
    const globalScope = globalThis as typeof globalThis & { [dictionaryPartStateKey]?: DictionaryPartState };
    globalScope[dictionaryPartStateKey] ??= {
      mergedByDictionary: new WeakMap(),
      loads: new Map(),
      failedAt: new Map(),
    };
    return globalScope[dictionaryPartStateKey];
  }

  static urlOf(lang: string, name: string): string | undefined {
    return TranslatorState.get().partsByLang.get(lang)?.[name];
  }

  static ready(lang: string, name: string): DictionaryPartLoad {
    const url = DictionaryPart.urlOf(lang, name);
    const base = TranslatorState.get().replacedByLang.get(lang);
    if (!url || !base) return settled;
    const state = DictionaryPart.#state();
    const load = state.loads.get(url);
    const merged = DictionaryPart.has(lang, url);
    if (load && (load.status === "pending" || merged || DictionaryPart.#failedOnThisPage(url))) return load;
    if (merged) return settled;
    state.failedAt.delete(url);
    const next = DictionaryPart.#track(DictionaryPart.#load(lang, url, base));
    state.loads.set(url, next);
    return next;
  }

  static has(lang: string, key: string): boolean {
    const dictionary = TranslatorState.get().langDictionaryMap.get(lang);
    return (dictionary && DictionaryPart.#state().mergedByDictionary.get(dictionary)?.has(key)) ?? false;
  }

  //? `base` is the snapshot the file was split from: one arriving after its locale was replaced is another build's.
  static merge(lang: string, key: string, dict: Dictionary, base: object): boolean {
    const { langDictionaryMap, replacedByLang } = TranslatorState.get();
    if (replacedByLang.get(lang) !== base) return false;
    if (DictionaryPart.has(lang, key)) return true;
    const { mergedByDictionary } = DictionaryPart.#state();
    const current = langDictionaryMap.get(lang) ?? {};
    const next = DictionaryPart.#mergeNode(current, dict) as Dictionary;
    mergedByDictionary.set(next, new Set(mergedByDictionary.get(current)).add(key));
    langDictionaryMap.set(lang, next);
    return true;
  }

  static async #load(lang: string, url: string, base: object): Promise<void> {
    try {
      DictionaryPart.merge(lang, url, (await importDictionaryModule(url)).default, base);
    } catch (error) {
      //? Settled, not rejected: a page whose file is gone shows without it rather than in its error boundary.
      DictionaryPart.#state().failedAt.set(url, TranslatorState.get().loadSeq);
      console.error(`[DictionaryPart] ${url} failed to load: ${String(error)}`);
    }
  }

  static #failedOnThisPage(url: string): boolean {
    const { failedAt } = DictionaryPart.#state();
    return failedAt.has(url) && failedAt.get(url) === TranslatorState.get().loadSeq;
  }

  static #track(loading: Promise<void>): DictionaryPartLoad {
    const status: DictionaryPartLoad["status"] = "pending";
    const tracked: DictionaryPartLoad = Object.assign(loading, { status, value: undefined });
    void loading.then(() => {
      tracked.status = "fulfilled";
    });
    return tracked;
  }

  //? Copies along the merged path only: the snapshot's own objects stay as imported, for a later replace to reuse.
  static #mergeNode(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const next = { ...target };
    for (const [key, value] of Object.entries(source)) {
      const current = next[key];
      next[key] =
        DictionaryPart.#isNode(current) && DictionaryPart.#isNode(value)
          ? DictionaryPart.#mergeNode(current, value)
          : value;
    }
    return next;
  }

  static #isNode(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

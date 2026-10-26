export interface Dictionary {
  [key: string]: {
    [key: string]: unknown;
  };
}
export interface AllDictionary {
  [key: string]: Dictionary;
}

interface TranslatorStateValue {
  langDictionaryMap: Map<string, Dictionary>;
  // A seeded snapshot is one reference per build, so a repeat seed skips the merge.
  seededDicts: WeakSet<object>;
  // The snapshot each locale was last replaced with: a tab may get an older build's dictionary back mid-deploy.
  replacedByLang: Map<string, object>;
  // Browser-only: never written on the server, where concurrent requests share this state.
  activeLocale?: string;
  // Browser-only copy of the server-resolved path, so the first client render matches SSR.
  activePath?: string;
  // The URL path of the CSR stack entry whose route render is running: a pushed entry renders before the URL moves.
  renderPath?: string;
}

const translatorStateKey = "__AKAN_TRANSLATOR_STATE__";

//? Kept free of imports, unlike `Translator`: the RSC client entry writes a loaded dictionary through it, and
//? `Translator` would bundle `akanjs/common` into that entry.
export class TranslatorState {
  static get(): TranslatorStateValue {
    const globalScope = globalThis as typeof globalThis & { [translatorStateKey]?: TranslatorStateValue };
    globalScope[translatorStateKey] ??= {
      langDictionaryMap: new Map<string, Dictionary>(),
      seededDicts: new WeakSet<object>(),
      replacedByLang: new Map<string, object>(),
    };
    return globalScope[translatorStateKey];
  }
  static replace(lang: string, dict: Dictionary | undefined) {
    if (!dict) return;
    const state = TranslatorState.get();
    if (state.replacedByLang.get(lang) === dict) return;
    state.seededDicts.add(dict);
    state.replacedByLang.set(lang, dict);
    state.langDictionaryMap.set(lang, { ...dict });
  }
}

import type { Dictionary } from "./translatorState";

export interface DictionaryModule {
  lang: string;
  default: Dictionary;
  parts?: Record<string, string>;
}

let retrySeq = 0;

//? A browser keeps a failed module fetch in its module map, so the retry imports the same file under a fresh query.
export const importDictionaryModule = async (url: string): Promise<DictionaryModule> => {
  try {
    return (await import(url)) as DictionaryModule;
  } catch {
    return (await import(`${url}?retry=${++retrySeq}`)) as DictionaryModule;
  }
};

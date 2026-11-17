import type { Dictionary } from "./translatorState";

export interface DictionaryModule {
  lang: string;
  default: Dictionary;
  parts?: Record<string, string>;
  //? Under `clientRuntime: "route"`: the build's group table, which every file cut from one page file names.
  table?: string;
  //? Set on a route's file, which holds these groups only; a page file, holding every group, has none.
  groups?: string[];
  //? Set on a part file (the API descriptions): it merges onto the build whose files name it in `parts`.
  part?: string;
}

let retrySeq = 0;

//? A browser keeps a failed module fetch in its module map, so the retry imports the same file under a fresh query.
export const importDictionaryModule = async <Module = DictionaryModule>(url: string): Promise<Module> => {
  try {
    return (await import(url)) as Module;
  } catch {
    return (await import(`${url}?retry=${++retrySeq}`)) as Module;
  }
};

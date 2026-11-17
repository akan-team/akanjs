import { DictionaryAsset } from "./dictionaryAsset";
import { importDictionaryModule } from "./dictionaryModule";
import { TranslatorState } from "./translatorState";

interface GroupTable {
  files: string[];
  default: Record<string, number>;
}

interface GroupWait {
  load: Promise<boolean>;
  //? Set by a render that showed the key: once the group merges, the page renders again to show its text.
  rendered: boolean;
  failedAt?: number;
}

interface DictionaryGroupsState {
  tables: Map<string, Promise<GroupTable>>;
  waits: Map<string, GroupWait>;
  reported: Set<string>;
  listeners: Set<() => void>;
}

const dictionaryGroupsStateKey = "__AKAN_DICTIONARY_GROUPS__";

//? The net under a route's files: a key of a group the build did not count for the route loads that group's file.
export class DictionaryGroups {
  static #state(): DictionaryGroupsState {
    const globalScope = globalThis as typeof globalThis & { [dictionaryGroupsStateKey]?: DictionaryGroupsState };
    globalScope[dictionaryGroupsStateKey] ??= {
      tables: new Map(),
      waits: new Map(),
      reported: new Set(),
      listeners: new Set(),
    };
    return globalScope[dictionaryGroupsStateKey];
  }

  //? `null` when there is nothing to load: the group is merged, the locale holds a page file, or no table was built.
  static pending(lang: string, key: string): Promise<boolean> | null {
    return DictionaryGroups.#wait(lang, key)?.load ?? null;
  }

  static missed(lang: string, key: string): void {
    if (typeof window === "undefined") return;
    const wait = DictionaryGroups.#wait(lang, key);
    if (!wait) return;
    wait.rendered = true;
    if (process.env.NODE_ENV === "production") return;
    const group = key.slice(0, key.indexOf("."));
    const { reported } = DictionaryGroups.#state();
    if (reported.has(group)) return;
    reported.add(group);
    const fault = new Error(
      `[dictionary] "${key}" was shown on a route whose dictionary files leave out "${group}": its file loads late. A key the build can read names the group, so the route loads it with the page.`,
    );
    void wait.load.then((merged) => merged && console.error(fault));
  }

  static onMerged(listener: () => void): () => void {
    const { listeners } = DictionaryGroups.#state();
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  static #wait(lang: string, key: string): GroupWait | null {
    const dot = key.indexOf(".");
    const group = dot > 0 ? key.slice(0, dot) : "";
    const translator = TranslatorState.get();
    const table = translator.tableByLang.get(lang);
    if (!group || !table || translator.langDictionaryMap.get(lang)?.[group] || DictionaryAsset.holdsEveryGroup(lang))
      return null;
    const { waits } = DictionaryGroups.#state();
    const id = `${table} ${group}`;
    const known = waits.get(id);
    if (known && (known.failedAt === undefined || known.failedAt === translator.loadSeq)) return known;
    const wait: GroupWait = { load: Promise.resolve(false), rendered: false };
    wait.load = DictionaryGroups.#load(table, group).then(
      (merged) => {
        if (merged && wait.rendered) for (const listener of DictionaryGroups.#state().listeners) listener();
        return merged;
      },
      (error: unknown) => {
        wait.failedAt = TranslatorState.get().loadSeq;
        console.error(`[DictionaryGroups] "${group}" failed to load: ${String(error)}`);
        return false;
      },
    );
    waits.set(id, wait);
    return wait;
  }

  //? A name no group holds (a text passed to `l` as is) resolves `false` once the table is in.
  static async #load(table: string, group: string): Promise<boolean> {
    const { files, default: fileOf } = await DictionaryGroups.#table(table);
    const idx = fileOf[group];
    const url = idx === undefined ? undefined : files[idx];
    return url ? DictionaryAsset.add(url) : false;
  }

  static #table(url: string): Promise<GroupTable> {
    const { tables } = DictionaryGroups.#state();
    const known = tables.get(url);
    if (known) return known;
    const loading = importDictionaryModule<GroupTable>(url).catch((error: unknown) => {
      tables.delete(url);
      throw error;
    });
    tables.set(url, loading);
    return loading;
  }
}

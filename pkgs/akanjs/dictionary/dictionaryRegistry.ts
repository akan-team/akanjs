import { ModelDictInfo, ScalarDictInfo, ServiceDictInfo } from "./dictInfo";
import type { DictModule } from "./locale";
import type { DictionaryNode, RootDictionary } from "./trans";

export type DictionaryModuleKind = "model" | "scalar" | "service";

export interface DictionaryModuleInfo {
  kind: DictionaryModuleKind;
  languages: string[];
}

/**
 * Collects every dictionary tree built by `makeTrans` so a server process can read the merged result.
 *
 * `makeTrans` keeps its `rootDictionary` in a closure and `AkanLib` carries no dictionary, so without this
 * the i18n tree is unreachable from `AkanServer`. Registration happens at module-evaluation time, which the
 * API process reaches because it imports the generated `server.ts` (which re-exports `lib/dict.ts`) whole.
 */
export class DictionaryRegistry {
  static readonly #roots: RootDictionary[] = [];
  static readonly #modules = new Map<string, DictionaryModuleInfo>();

  /** Registration order is base → libs → app, matching `makeDictionary`, so a later root wins on conflict. */
  static register(root: RootDictionary, transMap: Record<string, DictModule<string, string>>) {
    DictionaryRegistry.#roots.push(root);
    Object.entries(transMap).forEach(([refName, trans]) => {
      DictionaryRegistry.#modules.set(refName, {
        kind: DictionaryRegistry.#resolveKind(trans),
        languages: [...((trans.dict as { languages?: string[] }).languages ?? [])],
      });
    });
  }

  static getRoot(): RootDictionary {
    const merged = {} as RootDictionary;
    DictionaryRegistry.#roots.forEach((root) => {
      Object.entries(root).forEach(([language, models]) => {
        merged[language] = { ...(merged[language] ?? {}), ...models };
      });
    });
    return merged;
  }

  static getLanguages(): string[] {
    return [...new Set(DictionaryRegistry.#roots.flatMap((root) => Object.keys(root)))];
  }

  static getModules(): Record<string, DictionaryModuleInfo> {
    return Object.fromEntries([...DictionaryRegistry.#modules.entries()].map(([key, info]) => [key, { ...info }]));
  }

  /** Flattened dotted paths of every leaf translation, e.g. `"user.signal.createUser.arg.data"`. */
  static getKeys(root: RootDictionary = DictionaryRegistry.getRoot()): string[] {
    const keys = new Set<string>();
    Object.values(root).forEach((models) => {
      Object.entries(models).forEach(([refName, node]) => {
        DictionaryRegistry.#collectKeys(refName, node, keys);
      });
    });
    return [...keys].sort();
  }

  /** Test-only reset; the registry is module-level global state. */
  static clear() {
    DictionaryRegistry.#roots.length = 0;
    DictionaryRegistry.#modules.clear();
  }

  static #collectKeys(path: string, node: DictionaryNode, keys: Set<string>) {
    if (typeof node.t === "string") keys.add(path);
    Object.entries(node).forEach(([key, value]) => {
      if (key === "t" || !DictionaryRegistry.#isNode(value)) return;
      DictionaryRegistry.#collectKeys(`${path}.${key}`, value, keys);
    });
  }

  static #isNode(value: unknown): value is DictionaryNode {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  static #resolveKind(trans: DictModule<string, string>): DictionaryModuleKind {
    if (trans.dict instanceof ModelDictInfo) return "model";
    if (trans.dict instanceof ScalarDictInfo) return "scalar";
    if (trans.dict instanceof ServiceDictInfo) return "service";
    return "service";
  }
}
